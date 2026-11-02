import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { writeText } from '../documents/pdf-text';
import { randomBytes } from 'crypto';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { hashValue } from '../people/profile.service';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { due, inForce } from '../statutory/evaluator';
import { form16LinkProblem } from './form16-link';
import { DSC_REVOCATION, DSC_ROOTS, SignatureRefused, verifySignedPdf, type RevocationChecker, type TrustedRoots } from '../documents/signed-pdf';
import { asDate, dateOf, monthRange } from '../time/time-core';
import type { ConfirmationDto } from './dto';
import { ExchangeFilesService } from './exchange-files.service';
import { PayFileStore, sha256 } from './pay-file-store';
import { PayKey, entitiesFor, payScope, payViewer, requireEntity, requireSelf } from './pay-access';
import { TaxService } from './tax.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkService } from '../service-desk/work.service';
import type { DeskActor } from '../service-desk/desk-access';
import { todayIst } from '../org-structure/org-validation';

// Registers, inspection packs, the year-end certificates in bulk and the advisory feed (M03-BUILD-DESIGN §11.5, §11.6,
// PAY-6.05 Part A, 6.09, 6.10): the registers IN.REGISTERS asks for, from the stored payslip values, per entity, month
// and (optionally) place; frozen, then signed with the company's USB-token DSC (the signed file must start with exactly
// the frozen one); a fix is a new version with a reason, the old one kept as superseded; an employee sees only their
// own row (YX-SEC-16). Part A from the TRACES bulk download is matched by PAN; Form 130 / 16 go out in bulk.

/** The desks a person may add a task on: an agent or lead seat today, and the task key. */
export const deskTaskSeats = (a: DeskActor) => (a.keys.has('desk.task.work') ? [...a.roles].filter(([, r]) => r === 'agent' || r === 'lead').map(([d]) => d) : []);

/** Active people holding employee.change.manage (the HR admin role) for the whole company or a grant reaching the entity. */
export async function hrAdminsOf(tx: Tx, org: string, entityId: string): Promise<string[]> {
  const like = '%"employee.change.manage"%';
  const today = todayIst();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id::text FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
    WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
    UNION
    SELECT g.user_id::text FROM role_grants g
    JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
    JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
    WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND p.permissions_json LIKE ${like}
      AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)
      AND (g.scope_type = 'tenant' OR g.legal_entity_id = ${entityId}::uuid
        OR g.location_id IN (SELECT l.id FROM locations l WHERE l.organization_id = ${org}::uuid AND l.legal_entity_id = ${entityId}::uuid))
    LIMIT 50`;
  return rows.map((r) => r.id);
}

const STATUTORY_CODES = new Set(['pf_employee', 'esi_employee', 'pt', 'lwf_employee', 'tds', 'vpf']);
type RegisterType = { key: string; title: string; columns: string[] };

export function renderRegister(title: string, entity: string, month: string, place: string | null, columns: string[], rows: string[][], note: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, info: { Title: `${title} ${month}` } });
    const out: Buffer[] = [];
    doc
      .on('data', (b: Buffer) => out.push(b))
      .on('end', () => resolve(Buffer.concat(out)))
      .on('error', reject);
    doc.fontSize(14).text(title);
    writeText(doc.fontSize(10), `${entity}${place ? ` · ${place}` : ''} · ${month}`)
      .fontSize(8)
      .fillColor('#555')
      .text(note)
      .fillColor('#000')
      .moveDown();
    const width = (doc.page.width - 72) / columns.length;
    const line = (cells: string[], bold = false) => {
      const y = doc.y;
      cells.forEach((cell, i) => writeText(doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8), cell, 36 + i * width, y, { width: width - 4 }));
      doc.moveDown(0.6);
      if (doc.y > doc.page.height - 50) doc.addPage();
    };
    line(columns, true);
    for (const r of rows) line(r);
    if (!rows.length) doc.font('Helvetica').fontSize(9).text('No entries for this month.', 36);
    doc.end();
  });
}

@Injectable()
export class StatutoryRegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
    private readonly files: PayFileStore,
    private readonly exchange: ExchangeFilesService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly tax: TaxService,
    @Inject(DSC_ROOTS) private readonly roots: TrustedRoots,
    @Inject(DSC_REVOCATION) private readonly revocation: RevocationChecker,
    private readonly notifications: NotificationsService,
    private readonly work: WorkService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private async entity(tx: Tx, c: CompanyContext, v: Viewer, key: PayKey, entityId: string) {
    await requireEntity(tx, c, v, key, entityId);
    await payScope(tx, [entityId]);
    return tx.legalEntity.findFirstOrThrow({ where: { organizationId: c.organizationId, id: entityId }, select: { id: true, name: true, shortName: true } });
  }

  // ------------------------------------------------------------------------------------------ registers (PAY-6.09)

  /** Builds every register of the month (a new version needs a reason; the earlier one is kept as superseded). */
  async generate(ctx: TenantContext, user: ScopeUser, entityId: string, month: string, locationId: string | null, reason?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await this.entity(tx, c, v, 'statutory.filing.generate', entityId);
      const periodStart = asDate(`${month}-01`);
      const end = asDate(monthRange(month).to);
      const rs = inForce(await this.rules.published(), 'IN.REGISTERS', ['IN'], `${month}-01`);
      if (!rs) throw new ConflictException('No register formats are published for this month. YukthiX support publishes them first.');
      const place = locationId ? await tx.location.findFirst({ where: { organizationId: org, id: locationId, legalEntityId: e.id }, select: { name: true } }) : null;
      if (locationId && !place) throw new NotFoundException('Not found');
      if ((await tx.payrollRun.count({ where: { organizationId: org, legalEntityId: e.id, periodStart, status: { notIn: ['approved', 'paid', 'void'] } } })) > 0)
        throw new ConflictException('Registers are made once every payroll of the month is approved.');
      let slips = await tx.payslip.findMany({
        where: { organizationId: org, legalEntityId: e.id, periodStart, status: 'approved' },
        select: { id: true, employeeId: true, employmentId: true, gross: true, deductions: true, net: true },
      });
      const asg = await tx.employeeAssignment.findMany({
        where: { organizationId: org, employmentId: { in: slips.map((s) => s.employmentId) }, supersededAt: null, validFrom: { lte: end }, OR: [{ validTo: null }, { validTo: { gte: end } }] },
        select: { employmentId: true, locationId: true, designationId: true },
      });
      if (locationId) slips = slips.filter((s) => asg.find((a) => a.employmentId === s.employmentId)?.locationId === locationId);
      const lines = await tx.payslipLine.findMany({
        where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) } },
        select: { payslipId: true, componentCode: true, name: true, kind: true, amount: true, quantity: true },
      });
      const codes = new Map(
        (await tx.employment.findMany({ where: { organizationId: org, id: { in: slips.map((s) => s.employmentId) } }, select: { id: true, employeeCode: true } })).map((x) => [x.id, x.employeeCode]),
      );
      const people = new Map(
        (await tx.employee.findMany({ where: { organizationId: org, id: { in: slips.map((s) => s.employeeId) } }, select: { id: true, givenName: true, familyName: true } })).map((p) => [
          p.id,
          [p.givenName, p.familyName].filter(Boolean).join(' '),
        ]),
      );
      const designations = new Map(
        (await tx.designation.findMany({ where: { organizationId: org, id: { in: asg.map((a) => a.designationId) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]),
      );
      const paidOn = new Map(
        (await tx.paymentRecord.findMany({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, status: { in: ['paid', 'cash'] } }, orderBy: { recordedAt: 'desc' } })).map((p) => [
          p.payslipId,
          dateOf(p.recordedAt),
        ]),
      );
      const snaps = await tx.payslipSnapshot.findMany({ where: { payslipId: { in: slips.map((s) => s.id) } }, select: { payslipId: true, inputs: true } });
      const daysPaid = (id: string) => lines.filter((l) => l.payslipId === id && l.componentCode === 'basic' && l.quantity).reduce((t, l) => t + Number(l.quantity), 0);
      const lop = (id: string) => Number((snaps.find((x) => x.payslipId === id)?.inputs as { attendance?: { lopDays?: string } } | null)?.attendance?.lopDays ?? 0);
      const monthDays = Number(monthRange(month).to.slice(8));
      const built = (t: RegisterType): { employeeId: string; cells: string[] }[] => {
        if (t.key === 'wages')
          return slips.map((s) => ({
            employeeId: s.employeeId,
            cells: [
              codes.get(s.employmentId) ?? '',
              people.get(s.employeeId) ?? '',
              designations.get(asg.find((a) => a.employmentId === s.employmentId)?.designationId ?? '') ?? '',
              String(daysPaid(s.id)),
              s.gross.toFixed(2),
              s.deductions.toFixed(2),
              s.net.toFixed(2),
              paidOn.get(s.id) ?? '',
            ],
          }));
        if (t.key === 'deductions')
          return lines
            .filter((l) => l.kind === 'deduction' && !STATUTORY_CODES.has(l.componentCode))
            .map((l) => {
              const s = slips.find((x) => x.id === l.payslipId)!;
              return { employeeId: s.employeeId, cells: [codes.get(s.employmentId) ?? '', people.get(s.employeeId) ?? '', l.name, l.amount.toFixed(2)] };
            });
        return slips.map((s) => ({ employeeId: s.employeeId, cells: [codes.get(s.employmentId) ?? '', people.get(s.employeeId) ?? '', String(monthDays), String(lop(s.id)), String(daysPaid(s.id))] }));
      };
      const types = rs.values.types as RegisterType[];
      const current = await tx.statutoryRegister.findMany({ where: { organizationId: org, legalEntityId: e.id, locationId, periodStart, status: { not: 'superseded' } } });
      if (current.length && !reason) throw new BadRequestException('Registers for this month exist. Say why a new version is needed.');
      const made: { id: string; type: string; version: number; rows: number }[] = [];
      for (const t of types) {
        const rows = built(t);
        const old = current.find((x) => x.registerType === t.key);
        const pdf = await renderRegister(
          t.title,
          e.name,
          month,
          place?.name ?? null,
          t.columns,
          rows.map((r) => r.cells),
          `Format ${rs.version} (verify) · generated from approved payslips`,
        );
        const fileRef = await this.files.put(`registers/${org}/${e.id}/${randomBytes(12).toString('hex')}.pdf`, pdf);
        if (old) await tx.statutoryRegister.update({ where: { id: old.id }, data: { status: 'superseded' } });
        const reg = await tx.statutoryRegister.create({
          data: {
            organizationId: org,
            legalEntityId: e.id,
            locationId,
            registerType: t.key,
            periodStart,
            formatVersion: rs.version,
            version: (old?.version ?? 0) + 1,
            supersedesId: old?.id ?? null,
            reason: old ? reason! : null,
            fileRef,
            sha256: sha256(pdf),
            unsignedSha256: sha256(pdf),
            unsignedBytes: pdf.length,
            rowCount: rows.length,
            createdBy: v.userId!,
          },
        });
        if (rows.length)
          await tx.registerRow.createMany({
            data: rows.map((r) => ({ organizationId: org, legalEntityId: e.id, registerId: reg.id, employeeId: r.employeeId, data: { register: t.title, month, columns: t.columns, cells: r.cells } })),
          });
        made.push({ id: reg.id, type: t.key, version: reg.version, rows: rows.length });
      }
      await audit(tx, c, 'statutory.registers.generated', 'legal_entity', e.id, { month, locationId, registers: made, reason: reason ?? null });
      return { month, registers: made };
    });
  }

  private view(r: Prisma.StatutoryRegisterGetPayload<object>) {
    return {
      id: r.id,
      registerType: r.registerType,
      month: dateOf(r.periodStart).slice(0, 7),
      locationId: r.locationId,
      formatVersion: r.formatVersion,
      version: r.version,
      status: r.status,
      reason: r.reason,
      rows: r.rowCount,
      sha256: r.sha256,
      signatureRef: r.signatureRef,
      frozenAt: r.frozenAt,
      signedAt: r.signedAt,
    };
  }

  async list(ctx: TenantContext, user: ScopeUser, entityId: string, month?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, 'statutory.filing.view', entityId);
      const rows = await tx.statutoryRegister.findMany({
        where: { organizationId: c.organizationId, legalEntityId: entityId, ...(month ? { periodStart: asDate(`${month}-01`) } : {}) },
        orderBy: [{ periodStart: 'desc' }, { registerType: 'asc' }, { version: 'desc' }],
        take: 300,
      });
      return rows.map((r) => this.view(r));
    });
  }

  private async registerFor(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: PayKey) {
    const ids = await entitiesFor(tx, c, v, key);
    await payScope(tx, ids);
    const r = await tx.statutoryRegister.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!r || !ids.includes(r.legalEntityId)) throw new NotFoundException('Not found');
    return r;
  }

  /** The register's file (the frozen one to sign, or the signed one); the download is recorded with its hash. */
  async file(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.registerFor(tx, c, v, id, 'statutory.filing.download');
      const file = await this.files.get(r.fileRef);
      if (sha256(file) !== r.sha256) throw new ConflictException('This register does not match the file that was made.');
      await audit(tx, c, 'statutory.register.downloaded', 'statutory_register', r.id, { sha256: r.sha256 });
      return { file, name: `${r.registerType}-${dateOf(r.periodStart).slice(0, 7)}-v${r.version}.pdf`, contentType: 'application/pdf' };
    });
  }

  /** Frozen: it never changes again (database trigger); a fix is a new version. Step-up by the route. */
  async freeze(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.registerFor(tx, c, v, id, 'statutory.register.sign');
      if (r.status !== 'generated') throw new ConflictException(`This register is ${r.status}.`);
      const row = await tx.statutoryRegister.update({ where: { id }, data: { status: 'frozen', frozenAt: new Date() } });
      await audit(tx, c, 'statutory.register.frozen', 'statutory_register', id, { sha256: r.sha256 });
      return this.view(row);
    });
  }

  /** The company's USB-token signature: the uploaded PDF must be validly signed by a CCA-chained certificate over exactly the frozen file. */
  async sign(ctx: TenantContext, user: ScopeUser, id: string, file: Buffer | undefined) {
    const v = await this.viewer(user);
    if (!file?.length) throw new BadRequestException('Attach the signed PDF.');
    const r = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const x = await this.registerFor(tx, c, v, id, 'statutory.register.sign');
      if (x.status !== 'frozen') throw new ConflictException('Freeze the register before signing it.');
      return x;
    });
    let signer;
    try {
      signer = await verifySignedPdf(file, { sha256: r.unsignedSha256, bytes: r.unsignedBytes }, await this.roots.get(), this.revocation);
    } catch (e) {
      if (!(e instanceof SignatureRefused)) throw e;
      await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        await payScope(tx, [r.legalEntityId]);
        await audit(tx, c, 'statutory.register.signature_refused', 'statutory_register', r.id, { reason: e.message, uploadSha256: sha256(file) });
      });
      throw new BadRequestException({ statusCode: 400, code: 'SIGNATURE_REFUSED', message: e.message });
    }
    const fileRef = await this.files.put(`registers/${r.organizationId}/${r.legalEntityId}/${randomBytes(12).toString('hex')}.pdf`, file);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, [r.legalEntityId]);
      const done = await tx.statutoryRegister.updateMany({
        where: { organizationId: c.organizationId, id: r.id, status: 'frozen' },
        data: { status: 'signed', fileRef, sha256: sha256(file), signatureRef: `${signer.issuer} #${signer.serial}`.slice(0, 500), signedAt: new Date() },
      });
      if (!done.count) throw new ConflictException('This register was signed meanwhile.');
      await audit(tx, c, 'statutory.register.signed', 'statutory_register', r.id, {
        signer: signer.subject,
        issuer: signer.issuer,
        serial: signer.serial,
        sha256: sha256(file),
        unsignedSha256: r.unsignedSha256,
      });
      return { id: r.id, status: 'signed', signer: signer.subject };
    });
  }

  /** The person's own rows in any register (YX-SEC-16; the database shows nobody else's). */
  async mine(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const [{ ids }] = await tx.$queryRaw<{ ids: string[] }[]>`SELECT app_current_employee_ids()::text[] AS ids`;
      const rows = await tx.registerRow.findMany({ where: { organizationId: c.organizationId, employeeId: { in: ids ?? [] } }, take: 500 });
      return rows.map((r) => ({ registerId: r.registerId, ...(r.data as object) }));
    });
  }

  /** The inspection pack: the latest frozen or signed version of each register of the month, with a cover sheet of hashes. */
  async inspectionPack(ctx: TenantContext, user: ScopeUser, entityId: string, month: string, locationId: string | null) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await this.entity(tx, c, v, 'statutory.register.sign', entityId);
      const regs = await tx.statutoryRegister.findMany({
        where: { organizationId: org, legalEntityId: e.id, locationId, periodStart: asDate(`${month}-01`), status: { in: ['frozen', 'signed'] } },
        orderBy: { registerType: 'asc' },
      });
      if (!regs.length) throw new ConflictException('Freeze (and sign) the month’s registers first.');
      const zip = new JSZip();
      const cover = [
        `Inspection pack · ${e.name} · ${month}`,
        `Made ${new Date().toISOString()}`,
        '',
        ...regs.map((r) => `${r.registerType} v${r.version} (${r.status}) SHA-256 ${r.sha256}${r.signatureRef ? ` signed by ${r.signatureRef}` : ''}`),
      ].join('\r\n');
      zip.file('cover.txt', cover);
      for (const r of regs) {
        const f = await this.files.get(r.fileRef);
        if (sha256(f) !== r.sha256) throw new ConflictException(`The ${r.registerType} register does not match its file.`);
        zip.file(`${r.registerType}-${month}-v${r.version}.pdf`, f);
      }
      const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const ex = await this.exchange.generateIn(tx, c, {
        legalEntityId: e.id,
        kind: 'inspection',
        ownerType: 'inspection_pack',
        ownerId: null,
        periodStart: `${month}-01`,
        fileName: `inspection-pack-${(e.shortName || 'entity').toLowerCase()}-${month}.zip`,
        contentType: 'application/zip',
        data,
        rows: regs.length,
        totals: {},
        by: v.userId!,
      });
      const p = await tx.inspectionPack.create({
        data: { organizationId: org, legalEntityId: e.id, locationId, periodStart: asDate(`${month}-01`), registerIds: regs.map((r) => r.id), exchangeFileId: ex.id, createdBy: v.userId! },
      });
      await audit(tx, c, 'statutory.inspection_pack.made', 'inspection_pack', p.id, { month, registers: regs.length, sha256: ex.sha256 });
      return { id: p.id, fileId: ex.id, registers: regs.length, sha256: ex.sha256 };
    });
  }

  // ------------------------------------------------------------------------------------------ Part A and certificates in bulk (PAY-5.08, 6.05)

  /**
   * The TRACES Part A bulk download (a ZIP of PDFs whose names carry the PAN): each file is matched to a person by PAN
   * (compared by its keyed hash, never stored in clear) and attached to their certificate for the tax year.
   */
  async importPartA(ctx: TenantContext, user: ScopeUser, entityId: string, taxYear: string, zipFile: Buffer | undefined) {
    const v = await this.viewer(user);
    if (!zipFile?.length) throw new BadRequestException('Attach the ZIP downloaded from TRACES.');
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipFile);
    } catch {
      throw new BadRequestException('This is not a ZIP file.');
    }
    const entries = Object.values(zip.files).filter((f) => !f.dir && /\.pdf$/i.test(f.name));
    if (entries.length > 5000) throw new BadRequestException('A ZIP has at most 5,000 files.');
    // Security review: refuse a ZIP that would unpack to far more than it weighs (a zip bomb) before reading any file.
    const unpacked = entries.reduce((t, f) => t + ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
    if (unpacked > 200 * 1024 * 1024 || entries.some((f) => ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0) > 10 * 1024 * 1024))
      throw new BadRequestException('The ZIP unpacks to more than Part A files can be (10 MB each, 200 MB in all).');
    const found = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.filing.generate', entityId);
      const out: { file: string; employeeId: string | null }[] = [];
      for (const f of entries) {
        const pan = /[A-Z]{5}\d{4}[A-Z]/.exec(f.name.toUpperCase())?.[0];
        const who = pan ? await tx.employeeIdentifiers.findFirst({ where: { organizationId: org, panHash: hashValue(this.crypto, org, 'pan', pan) }, select: { employeeId: true } }) : null;
        out.push({ file: f.name, employeeId: who?.employeeId ?? null });
      }
      return out;
    });
    const matched: string[] = [];
    const unmatched: string[] = found.filter((x) => !x.employeeId).map((x) => x.file);
    for (const x of found.filter((y) => y.employeeId)) {
      const pdf = await zip.file(x.file)!.async('nodebuffer');
      if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
        unmatched.push(x.file);
        continue;
      }
      try {
        const cert = await this.tax.prepareCertificate(ctx, user, x.employeeId!, taxYear, 'statutory.filing.generate');
        await this.tax.attachPartA(ctx, user, cert.id, pdf, 'statutory.filing.generate');
        matched.push(x.employeeId!);
      } catch (e) {
        unmatched.push(`${x.file}: ${(e as Error).message}`);
      }
    }
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, [entityId]);
      await audit(tx, c, 'tax.part_a.imported', 'legal_entity', entityId, { taxYear, files: entries.length, matched: matched.length, unmatched: unmatched.length, sha256: sha256(zipFile) });
    });
    return { files: entries.length, matched: matched.length, unmatched };
  }

  /** Form 130 / 16 in bulk (step-up and the phrase): every prepared certificate with Part A is issued and so published. */
  async issueBatch(ctx: TenantContext, user: ScopeUser, entityId: string, taxYear: string, confirmation: ConfirmationDto) {
    const v = await this.viewer(user);
    const ids = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, 'statutory.register.sign', entityId);
      return (
        await tx.taxCertificate.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, taxYear, payDocumentId: null, partARef: { not: null } }, select: { id: true } })
      ).map((x) => x.id);
    });
    const issued: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.tax.issueCertificate(ctx, user, id, confirmation, 'statutory.register.sign');
        issued.push(id);
      } catch (e) {
        failed.push({ id, reason: (e as Error).message });
      }
    }
    return { issued: issued.length, failed };
  }

  /** After an accepted correction return: the changed people's issued certificates are revised (the earlier one kept as superseded). */
  async reviseCertificates(ctx: TenantContext, user: ScopeUser, entityId: string, taxYear: string, employeeIds: string[], reason: string, confirmation: ConfirmationDto) {
    const v = await this.viewer(user);
    const ids = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, 'statutory.register.sign', entityId);
      return (
        await tx.taxCertificate.findMany({
          where: { organizationId: c.organizationId, legalEntityId: entityId, taxYear, employeeId: { in: employeeIds }, payDocumentId: { not: null } },
          select: { id: true },
        })
      ).map((x) => x.id);
    });
    const revised: string[] = [];
    for (const id of ids) {
      await this.tax.issueCertificate(ctx, user, id, confirmation, 'statutory.register.sign', reason);
      revised.push(id);
    }
    return { revised: revised.length };
  }

  // ------------------------------------------------------------------------------------------ CMP-06 return link and availability

  private linkView(r: { id: string; formCode: string; taxYear: string; quarter: number; status: string; kind: string; tokenNo: string | null; filedAt: Date | null }) {
    return { returnId: r.id, formCode: r.formCode, taxYear: r.taxYear, quarter: r.quarter, status: r.status, kind: r.kind, tokenNo: r.tokenNo, filedAt: r.filedAt };
  }

  /**
   * The tax year's certificate set-up: the salary return the certificates are linked to (and what is wrong with it), the
   * year's own Q4 return, and from when certificates can be made (the Q4 return's due date in the published calendar).
   */
  async form16Status(ctx: TenantContext, user: ScopeUser, entityId: string, taxYear: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.filing.view', entityId);
      const link = await tx.form16ReturnLink.findFirst({ where: { organizationId: org, legalEntityId: entityId, taxYear } });
      const linked = link ? await tx.tdsReturn.findFirstOrThrow({ where: { organizationId: org, id: link.tdsReturnId } }) : null;
      const q4 = await tx.tdsReturn.findFirst({ where: { organizationId: org, legalEntityId: entityId, taxYear, quarter: 4, kind: 'original', formCode: { in: ['24Q', '138'] } } });
      const march = `${Number(taxYear.slice(0, 4)) + 1}-03`;
      const cal = inForce(await this.rules.published(), 'IN.TDS-DATES', ['IN'], `${march}-01`);
      return {
        taxYear,
        link: link && linked ? { ...this.linkView(linked), version: link.version, linkedAt: link.linkedAt, problem: form16LinkProblem(linked, taxYear) } : null,
        q4: q4 ? this.linkView(q4) : null,
        availableAfter: cal ? (due(cal, { key: 'tds_return_q4', month: march }).due as string) : null,
      };
    });
  }

  /** Links the year's certificates to a salary return of the entity (a wrong one is kept, shown and blocks issuing). */
  async linkForm16(ctx: TenantContext, user: ScopeUser, entityId: string, taxYear: string, returnId: string, version?: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.filing.generate', entityId);
      const r = await tx.tdsReturn.findFirst({ where: { organizationId: org, legalEntityId: entityId, id: returnId, formCode: { in: ['24Q', '138'] } } });
      if (!r) throw new NotFoundException('Not found');
      const old = await tx.form16ReturnLink.findFirst({ where: { organizationId: org, legalEntityId: entityId, taxYear } });
      if (old && version !== old.version) throw new ConflictException('Someone else changed the linked return. Reload to see it.');
      if (old?.tdsReturnId === returnId) throw new ConflictException('This return is already linked.');
      const row = old
        ? await tx.form16ReturnLink.update({ where: { id: old.id }, data: { tdsReturnId: returnId, linkedBy: v.userId!, linkedAt: new Date(), version: { increment: 1 } } })
        : await tx.form16ReturnLink.create({ data: { organizationId: org, legalEntityId: entityId, taxYear, tdsReturnId: returnId, linkedBy: v.userId! } });
      const problem = form16LinkProblem(r, taxYear);
      await audit(tx, c, 'statutory.form16.return_linked', 'form16_return_link', row.id, { taxYear, from: old?.tdsReturnId ?? null, to: returnId, quarter: r.quarter, problem });
      return { ...this.linkView(r), version: row.version, linkedAt: row.linkedAt, problem };
    });
  }

  // ------------------------------------------------------------------------------------------ advisories (PAY-6.10)

  /** Published labour-law advisories for the entity's states (and all-India), with whether they were reviewed. */
  async advisories(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.advisory.review', entityId);
      const states = [...new Set((await tx.location.findMany({ where: { organizationId: org, legalEntityId: entityId }, select: { state: true } })).map((l) => l.state))];
      const list = (await this.rules.published()).filter((r) => r.statute === 'IN.ADVISORY' && r.values.kind === 'advisory' && ['IN', ...states].includes(r.jurisdiction));
      const reviews = await tx.advisoryReview.findMany({ where: { organizationId: org, legalEntityId: entityId } });
      return list
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
        .map((r) => {
          const x = r.values as Record<string, string>;
          const done = reviews.find((y) => y.advisoryCode === x.code && y.ruleVersion === r.version);
          return {
            code: x.code,
            jurisdiction: r.jurisdiction,
            version: r.version,
            title: x.title,
            summary: x.summary,
            action: x.action,
            link: x.link ?? null,
            effectiveFrom: r.validFrom,
            verify: r.verify,
            reviewed: done ? { at: done.reviewedAt, note: done.note } : null,
          };
        });
    });
  }

  /** CMP-08: the help desks the reviewer may put a follow-up task on (they hold an agent or lead seat and may work tasks). */
  taskDesks(ctx: TenantContext, actor: DeskActor) {
    const ids = deskTaskSeats(actor);
    if (!ids.length) return Promise.resolve([]);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => tx.sdDesk.findMany({ where: { organizationId: c.organizationId, id: { in: ids }, status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }));
  }

  /**
   * Marks an advisory reviewed for the entity with a note. CMP-08: optionally a follow-up task on a help desk the reviewer
   * works on (given to them, with a due date; the desk's own task list), and optionally a note in the app to the entity's
   * HR admins (holders of employee.change.manage reaching the entity). The review is saved first; the task follows.
   */
  async review(ctx: TenantContext, user: ScopeUser, code: string, entityId: string, note: string, extra: { share?: boolean; task?: { deskId: string; dueOn: string; actor: DeskActor } } = {}) {
    const v = await this.viewer(user);
    if (extra.task && !deskTaskSeats(extra.task.actor).includes(extra.task.deskId)) throw new BadRequestException('Choose a help desk you work on for the task.');
    if (extra.task && extra.task.dueOn < todayIst()) throw new BadRequestException('Choose a due date from today on.');
    const saved = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, 'statutory.advisory.review', entityId);
      const r = (await this.rules.published())
        .filter((x) => x.statute === 'IN.ADVISORY' && (x.values as Record<string, string>).code === code)
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
      if (!r) throw new NotFoundException('Not found');
      const exists = await tx.advisoryReview.findFirst({ where: { organizationId: c.organizationId, legalEntityId: entityId, advisoryCode: code, ruleVersion: r.version } });
      if (exists) throw new ConflictException('This advisory is already reviewed for the entity.');
      const row = await tx.advisoryReview.create({ data: { organizationId: c.organizationId, legalEntityId: entityId, advisoryCode: code, ruleVersion: r.version, note, reviewedBy: v.userId! } });
      const hr = extra.share ? (await hrAdminsOf(tx, c.organizationId, entityId)).filter((u) => u !== v.userId) : [];
      await audit(tx, c, 'statutory.advisory.reviewed', 'advisory_review', row.id, { code, version: r.version, shareWith: hr.length, task: Boolean(extra.task) });
      return { row, title: String((r.values as Record<string, string>).title), hr };
    });
    const { row, title, hr } = saved;
    if (hr.length)
      await this.notifications
        .notify(ctx, v.userId!, hr, 'statutory.advisory.shared', { entityType: 'advisory_review', entityId: row.id, contextText: `Law update reviewed: ${title}. ${note}`.slice(0, 300), linkPath: '/yx/payroll/advisories' })
        .catch(() => undefined);
    let taskId: string | null = null;
    let taskError: string | null = null;
    if (extra.task) {
      try {
        taskId = (await this.work.addStandalone(extra.task.actor, { deskId: extra.task.deskId, title: `Law update: ${title}`.slice(0, 200), note: note.slice(0, 2000), assigneeUserId: v.userId!, dueAt: `${extra.task.dueOn}T12:00:00+05:30` })).id;
        await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
          await payScope(tx, [entityId]);
          await audit(tx, c, 'statutory.advisory.task_created', 'advisory_review', row.id, { taskId, deskId: extra.task!.deskId, dueOn: extra.task!.dueOn });
        });
      } catch (e) {
        taskError = `Reviewed, but the task was not made: ${(e as Error).message}`;
      }
    }
    return { code, reviewedAt: row.reviewedAt, sharedWith: hr.length, taskId, taskError };
  }
}
