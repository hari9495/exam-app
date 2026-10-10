import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { sealValue } from '../people/profile.service';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce } from '../statutory/evaluator';
import { asDate, dateOf } from '../time/time-core';
import type { CalcComponent, Segment } from './calc';
import type { ConfirmationDto } from './dto';
import type { DeclarationLineDto, PerquisiteDto, ProofDecisionDto, WorkspacePatchDto } from './dto-5e';
import { PayDocumentsService } from './documents.service';
import { PayFileStore, sha256 } from './pay-file-store';
import { PayKey, entitiesFor, payScope, payViewer, requireEntity, requireSelf, withPayScope } from './pay-access';
import { lawVersionFor, projectTax, taxForms, taxYearOf, type TaxInputs, type TaxProjection } from './tax';

// Income tax (M03-BUILD-DESIGN §8.5, §8.6, PAY-5.01 … 5.08): the employee's tax workspace (regime until the company's
// cut-off, then only HR with a reason; residential status; other income), declarations (Form 12BB or its successor) and
// proofs verified line by line by someone other than the employee, the tax sheet (the projection row of the latest
// payslip: the same numbers as the TDS deducted), perquisites (Form 12BA), and the year-end certificate (Form 16 / Form
// 130: Part A from TRACES, Part B from the year's payslips, issued as a DSC-signed pay document to the employee and alumni).

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const PROOF_TYPES: [string, (b: Buffer) => boolean][] = [
  ['application/pdf', (b) => b.subarray(0, 5).toString('latin1') === '%PDF-'],
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
];
type Workspace = Prisma.TaxWorkspaceGetPayload<object>;
type ProofFile = { ref: string; name: string; sha256: string; size: number; contentType: string; at: string };

/** The company's tax dates for a tax year (settings, P04 reminders go before each). */
export async function taxDates(tx: Tx, c: CompanyContext, legalEntityId: string, taxYear: string) {
  const y = Number(taxYear.slice(0, 4));
  const lev = { legalEntityId };
  const opens = await settingFor(tx, c, 'tax.proof_window_opens', lev);
  return {
    regimeCutoff: `${y}-${await settingFor(tx, c, 'tax.regime_cutoff', lev)}`,
    proofWindowOpens: `${Number(opens.slice(0, 2)) >= 4 ? y : y + 1}-${opens}`,
    proofCutoff: `${y + 1}-${await settingFor(tx, c, 'tax.proof_cutoff', lev)}`,
  };
}

const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/**
 * The tax inputs of one person's month (PAY-5.02, 5.05, 5.07), read with the pay guard opened to the whole company: the year
 * so far across every entity and employment of the person (transfers and rehires carry the year), earlier employers
 * (Form 12B) and opening balances, perquisites, the workspace and the declarations or verified proofs.
 */
export async function buildTaxInputs(
  tx: Tx,
  c: CompanyContext,
  a: { employeeId: string; employmentId: string; legalEntityId: string; month: string; periodStart: Date; exitedOn: Date | null; segment: Segment; components: CalcComponent[]; age: number },
): Promise<TaxInputs> {
  const org = c.organizationId;
  const taxYear = taxYearOf(a.month);
  const y = Number(taxYear.slice(0, 4));
  const all = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
  return withPayScope(tx, all, async () => {
    const ws = await tx.taxWorkspace.findFirst({ where: { organizationId: org, employmentId: a.employmentId, taxYear } });
    const ident = await tx.employeeIdentifiers.findFirst({ where: { organizationId: org, employeeId: a.employeeId }, select: { panHash: true } });
    const dates = await taxDates(tx, c, a.legalEntityId, taxYear);
    const monthEnd = dateOf(new Date(Date.UTC(Number(a.month.slice(0, 4)), Number(a.month.slice(5, 7)), 0)));
    const proofStage = monthEnd > dates.proofCutoff ? 'verified' : 'declared';
    const codes = (key: string) => a.components.filter((x) => x.statutory === key).map((x) => x.code);
    const slips = await tx.payslip.findMany({
      where: { organizationId: org, employeeId: a.employeeId, status: 'approved', periodStart: { gte: asDate(`${y}-04-01`), lt: a.periodStart } },
      select: { id: true, gross: true, periodStart: true, legalEntityId: true },
    });
    const lines = await tx.payslipLine.findMany({
      where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, componentCode: { in: ['basic', 'hra', 'tds', ...codes('tds'), ...codes('pt')] } },
      select: { payslipId: true, componentCode: true, amount: true },
    });
    const of = (ids: Set<string>, pick: (code: string) => boolean) => lines.filter((l) => ids.has(l.payslipId) && pick(l.componentCode)).reduce((t, l) => t.add(l.amount), ZERO);
    const allIds = new Set(slips.map((s) => s.id));
    const tdsCodes = new Set(['tds', ...codes('tds')]);
    const ptCodes = new Set(codes('pt'));
    const byMonth = new Map<string, Set<string>>();
    for (const s of slips) byMonth.set(dateOf(s.periodStart).slice(0, 7), new Set([...(byMonth.get(dateOf(s.periodStart).slice(0, 7)) ?? []), s.id]));
    const prev = await tx.previousEmploymentIncome.findMany({ where: { organizationId: org, employeeId: a.employeeId, fy: taxYear } });
    const opening = await tx.openingBalance.findMany({ where: { organizationId: org, employeeId: a.employeeId, fy: taxYear } });
    const head = (h: string) => opening.filter((o) => o.head === h).reduce((t, o) => t.add(o.amount), ZERO);
    const perqs = await tx.perquisite.findMany({ where: { organizationId: org, employeeId: a.employeeId, taxYear, cancelledAt: null } });
    const decl = ws ? await tx.taxDeclarationLine.findMany({ where: { organizationId: org, workspaceId: ws.id } }) : [];
    const counted = (l: (typeof decl)[number]) => (proofStage === 'declared' ? l.amount : ['approved', 'partly'].includes(l.proofStatus) ? (l.approvedAmount ?? ZERO) : ZERO);
    const hra = decl.find((l) => l.subjectKey === 'hra');
    const lastMonth = a.exitedOn && dateOf(a.exitedOn) < `${y + 1}-04-01` ? dateOf(a.exitedOn).slice(0, 7) : `${y + 1}-03`;
    const comp = new Map(a.components.map((x) => [x.code, x]));
    const monthly = (pick: (code: string) => boolean) =>
      a.segment.lines
        .filter((l) => pick(l.code))
        .reduce((t, l) => t.add(l.monthly), ZERO)
        .toFixed(2);
    return {
      taxYear,
      lawVersion: lawVersionFor(taxYear),
      regime: (ws?.regime ?? 'new') as 'new' | 'old',
      age: a.age,
      resident: ws?.residentialStatus !== 'non_resident',
      pan: !ident?.panHash ? 'missing' : ws?.panStatus === 'inoperative' ? 'inoperative' : 'ok',
      proofStage,
      past: {
        gross: slips.reduce((t, s) => t.add(s.gross), ZERO).toFixed(2),
        tds: of(allIds, (x) => tdsCodes.has(x)).toFixed(2),
        pt: of(allIds, (x) => ptCodes.has(x)).toFixed(2),
        months: [...byMonth.entries()]
          .sort(([x], [z]) => x.localeCompare(z))
          .map(([month, ids]) => ({ month, basic: of(ids, (x) => x === 'basic').toFixed(2), hra: of(ids, (x) => x === 'hra').toFixed(2) })),
        otherEntities: [...new Set(slips.map((s) => s.legalEntityId).filter((e) => e !== a.legalEntityId))],
      },
      previous: {
        gross: prev
          .reduce((t, p) => t.add(p.gross), ZERO)
          .add(head('gross'))
          .toFixed(2),
        exemptions: prev
          .reduce((t, p) => t.add(p.exemptions), ZERO)
          .add(head('exempt_allowances'))
          .toFixed(2),
        tds: prev
          .reduce((t, p) => t.add(p.tds), ZERO)
          .add(head('tds'))
          .toFixed(2),
        pt: head('pt').toFixed(2),
      },
      otherIncome: ((ws?.otherIncome as { amount: string }[] | undefined) ?? []).reduce((t, o) => t.add(o.amount), ZERO).toFixed(2),
      perquisites: perqs
        .reduce((t, p) => t.add(p.annualValue), ZERO)
        .add(head('perquisites'))
        .toFixed(2),
      futureMonths: Math.max(0, monthsBetween(a.month, lastMonth)),
      future: {
        gross: monthly((code) => comp.get(code)?.kind === 'earning' && comp.get(code)?.taxable !== false),
        basic: monthly((code) => code === 'basic'),
        hra: monthly((code) => code === 'hra'),
        pt: null,
      },
      deductions: decl.filter((l) => l.subjectKey !== 'hra').map((l) => ({ key: l.subjectKey, amount: counted(l).toFixed(2) })),
      treatyCountry: ws?.dtaaCountry ?? null,
      rent: hra && hra.rentFrom && hra.rentTo && counted(hra).gt(0) ? { monthly: counted(hra).toFixed(2), from: hra.rentFrom, to: hra.rentTo, metro: !!hra.metro } : null,
    };
  });
}

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
    private readonly files: PayFileStore,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly documents: PayDocumentsService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private async mine(tx: Tx): Promise<string[]> {
    const [{ ids }] = await tx.$queryRaw<{ ids: string[] }[]>`SELECT app_current_employee_ids()::text[] AS ids`;
    return ids ?? [];
  }

  /** The signed-in person's current employment and its workspace for this tax year (made on first use). */
  private async ownWorkspace(tx: Tx, c: CompanyContext) {
    const today = todayIst();
    const e = await tx.employment.findFirst({
      where: { organizationId: c.organizationId, employeeId: { in: await this.mine(tx) }, joinedOn: { lte: asDate(today) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(today) } }] },
      orderBy: { joinedOn: 'desc' },
    });
    if (!e) throw new NotFoundException('You have no current employment here.');
    const taxYear = taxYearOf(today.slice(0, 7));
    const ws =
      (await tx.taxWorkspace.findFirst({ where: { organizationId: c.organizationId, employmentId: e.id, taxYear } })) ??
      (await tx.taxWorkspace.create({
        data: { organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, taxYear, lawVersion: lawVersionFor(taxYear) },
      }));
    return { ws, dates: await taxDates(tx, c, e.legalEntityId, taxYear), today };
  }

  /** A workspace the key reaches (pay guard opened to those entities), never the viewer's own. */
  private async staffWorkspace(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: PayKey) {
    const ids = await entitiesFor(tx, c, v, key);
    await payScope(tx, ids);
    const ws = await tx.taxWorkspace.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!ws || !ids.includes(ws.legalEntityId)) throw new NotFoundException('Not found');
    if ((await this.mine(tx)).includes(ws.employeeId)) throw new ForbiddenException('Someone else handles your own tax.');
    return ws;
  }

  private view(ws: Workspace, dates?: Awaited<ReturnType<typeof taxDates>>, today?: string) {
    return {
      id: ws.id,
      employeeId: ws.employeeId,
      taxYear: ws.taxYear,
      lawVersion: ws.lawVersion,
      forms: taxForms(ws.lawVersion as 'IT-1961' | 'IT-2025'),
      regime: ws.regime,
      regimeSetAt: ws.regimeSetAt,
      regimeOverridden: Boolean(ws.regimeOverrideBy),
      residentialStatus: ws.residentialStatus,
      trcValidTo: ws.trcValidTo ? dateOf(ws.trcValidTo) : null,
      dtaaCountry: ws.dtaaCountry,
      // 5e-D3: no treaty relief is worked out; payroll handles a treaty claim by hand.
      treatyHandledByHand: Boolean(ws.dtaaCountry),
      panStatus: ws.panStatus,
      otherIncome: ws.otherIncome,
      ...(dates && today
        ? { dates, canChooseRegime: today <= dates.regimeCutoff, canDeclare: today <= dates.proofCutoff, canSendProofs: today >= dates.proofWindowOpens && today <= dates.proofCutoff }
        : {}),
    };
  }

  // ------------------------------------------------------------------------------------------ the employee (PAY-5.01, 5.03)

  async myWorkspace(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws, dates, today } = await this.ownWorkspace(tx, c);
      return this.view(ws, dates, today);
    });
  }

  /** The regime until the cut-off (YX-TAX-01); residential status, treaty details and other income at any time. */
  async patchWorkspace(ctx: TenantContext, user: ScopeUser, dto: WorkspacePatchDto) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws, dates, today } = await this.ownWorkspace(tx, c);
      if (dto.regime && dto.regime !== ws.regime && today > dates.regimeCutoff)
        throw new ConflictException(`The regime could be changed until ${dates.regimeCutoff}. Ask payroll to change it, with a reason.`);
      const data: Prisma.TaxWorkspaceUpdateInput = { updatedAt: new Date(), version: { increment: 1 } };
      if (dto.regime && dto.regime !== ws.regime) Object.assign(data, { regime: dto.regime, regimeSetAt: new Date() });
      if (dto.residentialStatus) data.residentialStatus = dto.residentialStatus;
      if (dto.trcValidTo !== undefined) data.trcValidTo = dto.trcValidTo ? asDate(dto.trcValidTo) : null;
      if (dto.dtaaCountry !== undefined) data.dtaaCountry = dto.dtaaCountry;
      if (dto.otherIncome) data.otherIncome = dto.otherIncome as unknown as Prisma.InputJsonValue;
      const row = await tx.taxWorkspace.update({ where: { id: ws.id }, data });
      await audit(tx, c, 'tax.workspace.updated', 'tax_workspace', ws.id, {
        regime: dto.regime ?? null,
        residentialStatus: dto.residentialStatus ?? null,
        otherIncome: dto.otherIncome ? dto.otherIncome.length : null,
      });
      return this.view(row, dates, today);
    });
  }

  /** The latest projection of the person's own approved payslips this tax year (the tax sheet, YX-TAX-06). */
  private async latestProjection(tx: Tx, org: string, employeeIds: string[], taxYear: string) {
    const rows = await tx.tdsProjection.findMany({ where: { organizationId: org, employeeId: { in: employeeIds }, taxYear }, orderBy: { createdAt: 'desc' }, take: 24 });
    const approved = new Set((await tx.payslip.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.payslipId) }, status: 'approved' }, select: { id: true } })).map((s) => s.id));
    return rows.find((r) => approved.has(r.payslipId)) ?? null;
  }

  async taxSheet(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws } = await this.ownWorkspace(tx, c);
      const p = await this.latestProjection(tx, c.organizationId, await this.mine(tx), ws.taxYear);
      if (!p) return { taxYear: ws.taxYear, sheet: null, message: 'Your tax sheet appears with your first payslip of the tax year.' };
      return { taxYear: ws.taxYear, payslipId: p.payslipId, month: (p.result as unknown as TaxProjection).thisMonth.month, sheet: p.result };
    });
  }

  /** Old and new regime on the figures of the latest payslip (the same function as the TDS). */
  async compare(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws } = await this.ownWorkspace(tx, c);
      const p = await this.latestProjection(tx, c.organizationId, await this.mine(tx), ws.taxYear);
      if (!p) throw new ConflictException('The comparison uses your figures from your first payslip of the tax year.');
      const inputs = p.inputs as unknown as TaxInputs;
      const month = (p.result as unknown as TaxProjection).thisMonth;
      const rules = await this.rules.published();
      const run = (regime: 'new' | 'old') => {
        const r = projectTax({ ...inputs, regime }, rules, month);
        return { regime, taxable: r.taxable, annualTax: r.tax.total, monthTds: r.monthTds };
      };
      const both = [run('new'), run('old')];
      return { taxYear: ws.taxYear, current: ws.regime, regimes: both, lower: D(both[0].annualTax).lte(both[1].annualTax) ? 'new' : 'old' };
    });
  }

  private async subjectKeys(on: string) {
    const rs = inForce(await this.rules.published(), 'IN.TAXDED', ['IN'], on);
    return { keys: new Set(['hra', ...Object.keys((rs?.values.caps as Record<string, unknown> | undefined) ?? {})]), landlordPanAbove: D(String(rs?.values.landlordPanAbove ?? '100000')) };
  }

  private lineView(l: Prisma.TaxDeclarationLineGetPayload<object>) {
    return {
      id: l.id,
      subjectKey: l.subjectKey,
      amount: l.amount.toFixed(2),
      landlordName: l.landlordName,
      landlordPan: l.landlordPanLast4 ? `••••••${l.landlordPanLast4}` : null,
      rentFrom: l.rentFrom,
      rentTo: l.rentTo,
      metro: l.metro,
      proofStatus: l.proofStatus,
      approvedAmount: l.approvedAmount?.toFixed(2) ?? null,
      comment: l.verifierComment,
      proofs: ((l.proofFiles as ProofFile[]) ?? []).map((f, i) => ({ n: i, name: f.name, size: f.size, at: f.at })),
    };
  }

  async declarations(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws } = await this.ownWorkspace(tx, c);
      const lines = await tx.taxDeclarationLine.findMany({ where: { organizationId: c.organizationId, workspaceId: ws.id }, orderBy: { subjectKey: 'asc' } });
      const labels = await tx.statutoryLawCrosswalk.findMany({ where: { lawVersion: ws.lawVersion, subjectKey: { in: lines.map((l) => l.subjectKey) } } });
      return {
        taxYear: ws.taxYear,
        form: ws.lawVersion === 'IT-2025' ? 'Form 12BB successor (verify number)' : 'Form 12BB',
        lines: lines.map((l) => ({ ...this.lineView(l), section: labels.find((x) => x.subjectKey === l.subjectKey)?.section ?? null })),
      };
    });
  }

  /** Declares (or changes) lines until the proof cut-off; a line with an approved proof is not changed. Amount 0 drops it. */
  async declare(ctx: TenantContext, user: ScopeUser, rows: DeclarationLineDto[]) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { ws, dates, today } = await this.ownWorkspace(tx, c);
      if (today > dates.proofCutoff) throw new ConflictException(`Declarations closed on ${dates.proofCutoff}.`);
      const { keys, landlordPanAbove } = await this.subjectKeys(today);
      const y = Number(ws.taxYear.slice(0, 4));
      for (const r of rows) {
        if (!keys.has(r.subjectKey)) throw new BadRequestException(`${r.subjectKey} is not something you can declare.`);
        const old = await tx.taxDeclarationLine.findFirst({ where: { organizationId: org, workspaceId: ws.id, subjectKey: r.subjectKey } });
        if (old && ['approved', 'partly'].includes(old.proofStatus)) throw new ConflictException(`${r.subjectKey} has a verified proof and is not changed.`);
        let pan: { enc: string; last4: string } | null = null;
        if (r.subjectKey === 'hra') {
          if (!r.rentFrom || !r.rentTo || r.metro === undefined || r.rentFrom > r.rentTo || r.rentFrom < `${y}-04` || r.rentTo > `${y + 1}-03`)
            throw new BadRequestException('Rent needs the months you pay it in this tax year and whether the city is a metro.');
          const yearly = D(r.amount).mul(monthsBetween(r.rentFrom, r.rentTo) + 1);
          if (yearly.gt(landlordPanAbove) && !r.landlordPan) throw new BadRequestException(`Rent above ₹${landlordPanAbove.toFixed(0)} a year needs your landlord's PAN.`);
          if (r.landlordPan) {
            if (!PAN.test(r.landlordPan)) throw new BadRequestException("The landlord's PAN looks like ABCDE1234F.");
            pan = { enc: sealValue(this.crypto, org, ws.employeeId, r.landlordPan), last4: r.landlordPan.slice(-4) };
          }
        }
        const data = {
          amount: D(r.amount),
          landlordName: r.landlordName ?? null,
          landlordPanEnc: pan?.enc ?? null,
          landlordPanLast4: pan?.last4 ?? null,
          rentFrom: r.subjectKey === 'hra' ? r.rentFrom! : null,
          rentTo: r.subjectKey === 'hra' ? r.rentTo! : null,
          metro: r.subjectKey === 'hra' ? !!r.metro : null,
          updatedAt: new Date(),
        };
        if (old) await tx.taxDeclarationLine.update({ where: { id: old.id }, data: { ...data, ...(old.proofStatus === 'rejected' ? { proofStatus: 'none' } : {}) } });
        else await tx.taxDeclarationLine.create({ data: { organizationId: org, legalEntityId: ws.legalEntityId, employeeId: ws.employeeId, workspaceId: ws.id, subjectKey: r.subjectKey, ...data } });
      }
      await audit(tx, c, 'tax.declaration.saved', 'tax_workspace', ws.id, { lines: rows.map((r) => r.subjectKey) });
      return { saved: rows.length };
    });
  }

  /** A proof for one line, in the proof window (PDF, PNG or JPEG, checked by content); stored encrypted with its hash. */
  async addProof(ctx: TenantContext, user: ScopeUser, lineId: string, file: { buffer: Buffer; originalname?: string } | undefined) {
    await this.viewer(user);
    if (!file?.buffer?.length) throw new BadRequestException('Attach the proof (PDF, PNG or JPEG).');
    const type = PROOF_TYPES.find(([, is]) => is(file.buffer))?.[0];
    if (!type) throw new BadRequestException('A proof is a PDF, PNG or JPEG file.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws, dates, today } = await this.ownWorkspace(tx, c);
      if (today < dates.proofWindowOpens || today > dates.proofCutoff) throw new ConflictException(`Proofs are sent from ${dates.proofWindowOpens} to ${dates.proofCutoff}.`);
      const l = await tx.taxDeclarationLine.findFirst({ where: { organizationId: c.organizationId, workspaceId: ws.id, id: lineId } });
      if (!l) throw new NotFoundException('Not found');
      if (['approved', 'partly'].includes(l.proofStatus)) throw new ConflictException('This line is already verified.');
      const files = (l.proofFiles as ProofFile[]) ?? [];
      if (files.length >= 10) throw new ConflictException('A line has at most 10 proof files.');
      const ref = await this.files.put(`tax-proofs/${c.organizationId}/${ws.legalEntityId}/${randomBytes(12).toString('hex')}`, file.buffer);
      const entry: ProofFile = {
        ref,
        name: (file.originalname ?? 'proof').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 100),
        sha256: sha256(file.buffer),
        size: file.buffer.length,
        contentType: type,
        at: new Date().toISOString(),
      };
      await tx.taxDeclarationLine.update({ where: { id: l.id }, data: { proofFiles: [...files, entry] as unknown as Prisma.InputJsonValue, proofStatus: 'pending', updatedAt: new Date() } });
      await audit(tx, c, 'tax.proof.submitted', 'tax_declaration_line', l.id, { subjectKey: l.subjectKey, sha256: entry.sha256 });
      return { lineId: l.id, proofStatus: 'pending', files: files.length + 1 };
    });
  }

  // ------------------------------------------------------------------------------------------ payroll (PAY-5.03, 5.05, 5.06)

  async workspaces(ctx: TenantContext, user: ScopeUser, employeeId?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.workspace.view');
      await payScope(tx, ids);
      const rows = await tx.taxWorkspace.findMany({
        where: { organizationId: c.organizationId, legalEntityId: { in: ids }, ...(employeeId ? { employeeId } : {}) },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      });
      return rows.map((w) => this.view(w));
    });
  }

  /** The verification queue: lines with proofs, of the entities in scope (never one's own). */
  async proofQueue(ctx: TenantContext, user: ScopeUser, status = 'pending') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
      await payScope(tx, ids);
      const me = await this.mine(tx);
      const rows = await tx.taxDeclarationLine.findMany({
        where: { organizationId: c.organizationId, legalEntityId: { in: ids }, proofStatus: status, employeeId: { notIn: me } },
        orderBy: { updatedAt: 'asc' },
        take: 300,
      });
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, givenName: true, familyName: true } });
      return rows.map((l) => ({ ...this.lineView(l), workspaceId: l.workspaceId, employeeId: l.employeeId, employeeName: people.find((p) => p.id === l.employeeId)?.givenName ?? '' }));
    });
  }

  private async lineFor(tx: Tx, c: CompanyContext, v: Viewer, workspaceId: string, lineId: string) {
    const ws = await this.staffWorkspace(tx, c, v, workspaceId, 'tax.proof.verify');
    const l = await tx.taxDeclarationLine.findFirst({ where: { organizationId: c.organizationId, workspaceId: ws.id, id: lineId } });
    if (!l) throw new NotFoundException('Not found');
    return { ws, l };
  }

  async proofFile(ctx: TenantContext, user: ScopeUser, workspaceId: string, lineId: string, n: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { l } = await this.lineFor(tx, c, v, workspaceId, lineId);
      const f = ((l.proofFiles as ProofFile[]) ?? [])[n];
      if (!f) throw new NotFoundException('Not found');
      const file = await this.files.get(f.ref);
      if (sha256(file) !== f.sha256) throw new ConflictException('This proof does not match the file that was sent.');
      await audit(tx, c, 'tax.proof.viewed', 'tax_declaration_line', l.id, { sha256: f.sha256 });
      return { file, name: f.name, contentType: f.contentType };
    });
  }

  /** Approve, partly approve (with the amount) or reject (with a comment), line by line; never one's own (YX-TAX-05). */
  async decide(ctx: TenantContext, user: ScopeUser, workspaceId: string, lineId: string, dto: ProofDecisionDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { l } = await this.lineFor(tx, c, v, workspaceId, lineId);
      if (l.proofStatus !== 'pending') throw new ConflictException('This line has no proof waiting.');
      let approved: Prisma.Decimal | null = null;
      if (dto.decision === 'approve') approved = l.amount;
      if (dto.decision === 'partly') {
        if (!dto.amount || D(dto.amount).gte(l.amount) || D(dto.amount).lte(0)) throw new BadRequestException('A part approval is an amount above zero and below what was declared.');
        approved = D(dto.amount);
      }
      if (dto.decision !== 'approve' && !dto.comment) throw new BadRequestException('Say why, so the employee can fix it.');
      const status = dto.decision === 'approve' ? 'approved' : dto.decision === 'partly' ? 'partly' : 'rejected';
      await tx.taxDeclarationLine.update({
        where: { id: l.id },
        data: { proofStatus: status, approvedAmount: approved, verifierId: v.userId!, verifierComment: dto.comment ?? null, verifiedAt: new Date(), updatedAt: new Date() },
      });
      await audit(tx, c, 'tax.proof.verified', 'tax_declaration_line', l.id, { employeeId: l.employeeId, subjectKey: l.subjectKey, status, approvedAmount: approved?.toFixed(2) ?? null });
      return { lineId: l.id, proofStatus: status, approvedAmount: approved?.toFixed(2) ?? null };
    });
  }

  async overrideRegime(ctx: TenantContext, user: ScopeUser, id: string, regime: 'new' | 'old', reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ws = await this.staffWorkspace(tx, c, v, id, 'tax.regime.override');
      const row = await tx.taxWorkspace.update({
        where: { id: ws.id },
        data: { regime, regimeSetAt: new Date(), regimeOverrideBy: v.userId!, regimeOverrideReason: reason, updatedAt: new Date(), version: { increment: 1 } },
      });
      await audit(tx, c, 'tax.regime.overridden', 'tax_workspace', ws.id, { employeeId: ws.employeeId, from: ws.regime, to: regime, reason });
      return this.view(row);
    });
  }

  /**
   * PAN operative or inoperative (YX-TAX-10): recorded by payroll with a reason. Without a PAN on file the tax is at the
   * higher rate anyway. Founder decision 5e-D2: recorded by hand; a checking provider comes later.
   */
  async panStatus(ctx: TenantContext, user: ScopeUser, id: string, status: 'operative' | 'inoperative', reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ws = await this.staffWorkspace(tx, c, v, id, 'tax.proof.verify');
      const row = await tx.taxWorkspace.update({
        where: { id: ws.id },
        data: { panStatus: status, panStatusBy: v.userId!, panStatusReason: reason, updatedAt: new Date(), version: { increment: 1 } },
      });
      await audit(tx, c, 'tax.pan_status.recorded', 'tax_workspace', ws.id, { employeeId: ws.employeeId, status, reason });
      return this.view(row);
    });
  }

  // Perquisites (Form 12BA, PAY-5.06).
  async perquisites(ctx: TenantContext, user: ScopeUser, employeeId?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
      await payScope(tx, ids);
      const rows = await tx.perquisite.findMany({
        where: { organizationId: c.organizationId, legalEntityId: { in: ids }, ...(employeeId ? { employeeId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return rows.map((p) => ({
        id: p.id,
        employeeId: p.employeeId,
        taxYear: p.taxYear,
        kind: p.kind,
        annualValue: p.annualValue.toFixed(2),
        description: p.description,
        cancelled: Boolean(p.cancelledAt),
      }));
    });
  }

  async addPerquisite(ctx: TenantContext, user: ScopeUser, dto: PerquisiteDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const y = Number(dto.taxYear.slice(0, 4));
      const e = await tx.employment.findFirst({
        where: { organizationId: c.organizationId, employeeId: dto.employeeId, joinedOn: { lte: asDate(`${y + 1}-03-31`) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(`${y}-04-01`) } }] },
        orderBy: { joinedOn: 'desc' },
      });
      if (!e) throw new NotFoundException('Not found');
      await requireEntity(tx, c, v, 'tax.proof.verify', e.legalEntityId);
      if ((await this.mine(tx)).includes(dto.employeeId)) throw new ForbiddenException('Someone else records your own perquisites.');
      await payScope(tx, [e.legalEntityId]);
      const p = await tx.perquisite.create({
        data: {
          organizationId: c.organizationId,
          legalEntityId: e.legalEntityId,
          employeeId: dto.employeeId,
          employmentId: e.id,
          taxYear: dto.taxYear,
          kind: dto.kind,
          annualValue: D(dto.annualValue),
          description: dto.description,
          enteredBy: v.userId!,
        },
      });
      await audit(tx, c, 'tax.perquisite.added', 'perquisite', p.id, { employeeId: dto.employeeId, kind: dto.kind, taxYear: dto.taxYear });
      return { id: p.id };
    });
  }

  async cancelPerquisite(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
      await payScope(tx, ids);
      const p = await tx.perquisite.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!p || !ids.includes(p.legalEntityId)) throw new NotFoundException('Not found');
      if ((await this.mine(tx)).includes(p.employeeId)) throw new ForbiddenException('Someone else records your own perquisites.');
      if (!p.cancelledAt) await tx.perquisite.update({ where: { id }, data: { cancelledAt: new Date() } });
      await audit(tx, c, 'tax.perquisite.cancelled', 'perquisite', id, {});
      return { id, cancelled: true };
    });
  }

  // ------------------------------------------------------------------------------------------ year-end certificate (PAY-5.08)

  /** Part B from the year's approved payslips and the last projection; Form 16 for years to March 2026, Form 130 after. */
  /** Part B of a person's year in one entity from the approved payslips and the last projection. */
  private async partBOf(tx: Tx, org: string, employeeId: string, legalEntityId: string, taxYear: string) {
    const y = Number(taxYear.slice(0, 4));
    const p = await this.latestProjection(tx, org, [employeeId], taxYear);
    if (!p) throw new ConflictException('There is no approved payslip with tax for this person in that tax year.');
    const r = p.result as unknown as TaxProjection;
    const slips = await tx.payslip.findMany({ where: { organizationId: org, employeeId, legalEntityId, status: 'approved', periodStart: { gte: asDate(`${y}-04-01`), lte: asDate(`${y + 1}-03-01`) } }, select: { id: true, gross: true } });
    const tds = await tx.payslipLine.aggregate({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, componentCode: 'tds' }, _sum: { amount: true } });
    return { taxYear, lawVersion: lawVersionFor(taxYear), regime: r.regime, grossSalary: slips.reduce((t, s) => t.add(s.gross), ZERO).toFixed(2), income: r.income, exemptions: r.exemptions, deductions: r.deductions, taxable: r.taxable, tax: r.tax, taxDeducted: (tds._sum.amount ?? ZERO).toFixed(2), perquisites: r.income.perquisites };
  }

  async prepareCertificate(ctx: TenantContext, user: ScopeUser, employeeId: string, taxYear: string, key: PayKey = 'payroll.document.issue') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const y = Number(taxYear.slice(0, 4));
      const e = await tx.employment.findFirst({
        where: { organizationId: org, employeeId, joinedOn: { lte: asDate(`${y + 1}-03-31`) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(`${y}-04-01`) } }] },
        orderBy: { joinedOn: 'desc' },
      });
      if (!e) throw new NotFoundException('Not found');
      await requireEntity(tx, c, v, key, e.legalEntityId);
      if ((await this.mine(tx)).includes(employeeId)) throw new ForbiddenException('Someone else issues your own tax certificate.');
      await payScope(tx, [e.legalEntityId]);
      const law = lawVersionFor(taxYear);
      const partB = await this.partBOf(tx, org, employeeId, e.legalEntityId, taxYear);
      const existing = await tx.taxCertificate.findFirst({ where: { organizationId: org, employmentId: e.id, taxYear } });
      if (existing?.payDocumentId) throw new ConflictException('This certificate is issued. A correction supersedes the pay document.');
      const row = existing
        ? await tx.taxCertificate.update({ where: { id: existing.id }, data: { partB: partB as unknown as Prisma.InputJsonValue } })
        : await tx.taxCertificate.create({
            data: {
              organizationId: org,
              legalEntityId: e.legalEntityId,
              employeeId,
              employmentId: e.id,
              taxYear,
              lawVersion: law,
              form: taxForms(law).certificate,
              partB: partB as unknown as Prisma.InputJsonValue,
              createdBy: v.userId!,
            },
          });
      await audit(tx, c, 'tax.certificate.prepared', 'tax_certificate', row.id, { employeeId, taxYear, form: row.form });
      return { id: row.id, form: row.form, partB, partA: Boolean(row.partARef) };
    });
  }

  private async certificateFor(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: PayKey = 'payroll.document.issue') {
    const ids = await entitiesFor(tx, c, v, key);
    await payScope(tx, ids);
    const t = await tx.taxCertificate.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!t || !ids.includes(t.legalEntityId)) throw new NotFoundException('Not found');
    if ((await this.mine(tx)).includes(t.employeeId)) throw new ForbiddenException('Someone else issues your own tax certificate.');
    return t;
  }

  /** Part A as downloaded from TRACES (a PDF); kept encrypted with its hash. */
  async attachPartA(ctx: TenantContext, user: ScopeUser, id: string, file: Buffer | undefined, key: PayKey = 'payroll.document.issue') {
    const v = await this.viewer(user);
    if (!file?.length || file.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('Part A is the PDF downloaded from TRACES.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await this.certificateFor(tx, c, v, id, key);
      if (t.payDocumentId) throw new ConflictException('This certificate is issued.');
      const ref = await this.files.put(`tax-certificates/${c.organizationId}/${t.legalEntityId}/${randomBytes(12).toString('hex')}.pdf`, file);
      await tx.taxCertificate.update({ where: { id: t.id }, data: { partARef: ref, partASha256: sha256(file) } });
      await audit(tx, c, 'tax.certificate.part_a', 'tax_certificate', t.id, { sha256: sha256(file) });
      return { id: t.id, partA: true };
    });
  }

  /** Issues Part B as a pay document (DSC where the company signs, verify code); the employee and alumni then see it. */
  /**
   * Issues Part B as a pay document; with `revise` (after an accepted correction return, YX-TAX-20) Part B is worked out
   * again and the new document supersedes the issued one, which stays as superseded.
   */
  async issueCertificate(ctx: TenantContext, user: ScopeUser, id: string, confirmation: ConfirmationDto, key: PayKey = 'payroll.document.issue', revise?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      let t = await this.certificateFor(tx, c, v, id, key);
      if (t.payDocumentId && !revise) throw new ConflictException('This certificate is already issued.');
      if (!t.payDocumentId && revise) throw new ConflictException('This certificate is not issued yet.');
      if (!t.partARef) throw new ConflictException('Attach Part A from TRACES first.');
      const phrase = `ISSUE ${t.form.toUpperCase()} ${t.taxYear}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      const old = t.payDocumentId ? await tx.payDocument.findFirstOrThrow({ where: { organizationId: org, id: t.payDocumentId } }) : null;
      if (revise) t = await tx.taxCertificate.update({ where: { id: t.id }, data: { partB: (await this.partBOf(tx, org, t.employeeId, t.legalEntityId, t.taxYear)) as unknown as Prisma.InputJsonValue } });
      const b = t.partB as unknown as {
        regime: string;
        income: TaxProjection['income'];
        exemptions: TaxProjection['exemptions'];
        deductions: TaxProjection['deductions'];
        taxable: string;
        taxDeducted: string;
      };
      const [entity, person, employment, ident] = await Promise.all([
        tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: t.legalEntityId }, select: { name: true } }),
        tx.employee.findFirstOrThrow({ where: { organizationId: org, id: t.employeeId }, select: { givenName: true, familyName: true } }),
        tx.employment.findFirstOrThrow({ where: { organizationId: org, id: t.employmentId }, select: { employeeCode: true } }),
        tx.employeeIdentifiers.findFirst({ where: { organizationId: org, employeeId: t.employeeId }, select: { panLast4: true } }),
      ]);
      const label: Record<string, string> = { salary: 'Salary', previousEmployers: 'Earlier employers', perquisites: 'Perquisites (Form 12BA)', other: 'Other income' };
      const earnings = Object.entries(label)
        .filter(([k]) => D(b.income[k as keyof typeof b.income]).gt(0))
        .map(([k, l]) => ({ label: l, amount: D(b.income[k as keyof typeof b.income]).toFixed(2) }));
      const deductions = [
        { label: 'Standard deduction', amount: b.exemptions.standardDeduction },
        { label: 'HRA exemption', amount: b.exemptions.hra },
        { label: 'Professional tax', amount: b.exemptions.professionalTax },
        ...b.deductions.filter((d) => D(d.allowed).gt(0)).map((d) => ({ label: d.key, amount: d.allowed })),
      ].filter((x) => D(x.amount).gt(0));
      const doc = await this.documents.issueIn(tx, c, {
        employeeId: t.employeeId,
        legalEntityId: t.legalEntityId,
        kind: t.form as 'form16' | 'form130',
        month: null,
        fields: {
          employerName: entity.name,
          employeeName: [person.givenName, person.familyName].filter(Boolean).join(' '),
          employeeCode: employment.employeeCode,
          pan: ident?.panLast4 ? `••••••${ident.panLast4}` : 'Not on file',
          taxYear: t.taxYear,
          regime: b.regime,
          taxable: b.taxable,
          taxDeducted: b.taxDeducted,
          partA: `TRACES Part A, SHA-256 ${t.partASha256}`,
          earnings,
          deductions,
        },
        supersedes: old,
        by: v.userId!,
        confirmation,
        reason: revise,
      });
      await tx.taxCertificate.update({ where: { id: t.id }, data: { payDocumentId: doc.id } });
      await audit(tx, c, revise ? 'tax.certificate.revised' : 'tax.certificate.issued', 'tax_certificate', t.id, { payDocumentId: doc.id, form: t.form, taxYear: t.taxYear, supersedes: old?.id ?? null, reason: revise ?? null });
      return { id: t.id, payDocumentId: doc.id, referenceNo: doc.referenceNo, status: doc.status, signature: doc.signature };
    });
  }

  /** The person's own issued certificates, with Part A to download. */
  async myCertificates(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.taxCertificate.findMany({
        where: { organizationId: c.organizationId, employeeId: { in: await this.mine(tx) }, payDocumentId: { not: null } },
        orderBy: { taxYear: 'desc' },
      });
      return rows.map((t) => ({ id: t.id, taxYear: t.taxYear, form: t.form, payDocumentId: t.payDocumentId }));
    });
  }

  async myPartA(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await tx.taxCertificate.findFirst({ where: { organizationId: c.organizationId, id, employeeId: { in: await this.mine(tx) }, payDocumentId: { not: null } } });
      if (!t?.partARef) throw new NotFoundException('Not found');
      const file = await this.files.get(t.partARef);
      if (sha256(file) !== t.partASha256) throw new ConflictException('This file does not match the one attached.');
      await audit(tx, c, 'tax.certificate.part_a_downloaded', 'tax_certificate', t.id, {});
      return { file, name: `${t.form}-part-a-${t.taxYear}.pdf`, contentType: 'application/pdf' };
    });
  }
}
