import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { join } from 'path';
import { FONT_DIR, FONT_FILE, LABELS, localOf, writeLabel, type LocalLanguage } from '../documents/payslip-languages';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { createHash, randomBytes } from 'crypto';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { OtpService } from '../auth/otp.service';
import { has, type ScopeUser } from '../access/scope';
import { asDate, dateOf } from '../time/time-core';
import { ConfirmationDto, IssueDocumentDto, NomineeDto, PortalEmailDto, PortalVerifyDto } from './dto';
import { dscSigner } from '../documents/signing';
import { DSC_REVOCATION, DSC_ROOTS, SignatureRefused, verifySignedPdf, type RevocationChecker, type TrustedRoots } from '../documents/signed-pdf';
import { VERIFY_CODE, referenceNo, verifyCode, verifyLink, verifyElsewhere } from '../documents/verify-code';
import { Inject } from '@nestjs/common';
import type { Certificate } from 'pkijs';
import { PayAuditService } from './audit.service';
import { PayFileStore, sha256 } from './pay-file-store';
import { entitiesFor, payScope, payViewer, requireEntity, requireSelf } from './pay-access';

// PAY-1.09 pay documents on the P05 pattern (YX-DOC-07…13, 22) and PAY-1.10 alumni / nominee access (YX-DOC-16, 19):
// a template with its mandatory fields (the payslip's from P07 IN.WAGESLIP, locked), a PDF rendered once, stored
// encrypted with its SHA-256, a reference number without gaps per legal entity and kind, a verify code for the public
// page, the company DSC where the kind needs it (§19 D4). An issued document never changes (database trigger); a
// correction issues a new one that supersedes it.

const KIND_LABEL: Record<string, string> = { payslip: 'Payslip', revision_letter: 'Salary revision letter', payment_advice: 'Payment advice', form130: 'Form 130', form131: 'Form 131', register: 'Statutory register', inspection_pack: 'Inspection pack', correction_statement: 'Correction statement' };
const KIND_CODE: Record<string, string> = { payslip: 'PS', revision_letter: 'RL', payment_advice: 'PA', form130: 'F130', form131: 'F131', register: 'REG', inspection_pack: 'INS', correction_statement: 'CS' };
/** Kinds the company DSC signs (P05 Q2: Form 130 / 131, registers and letters). */
const DSC_KINDS = new Set(['form130', 'form131', 'register', 'revision_letter']);
// Founder decision D3 (9 Oct 2026): former employees sign in with their personal email on record, else their old work
// email. The step where HR confirms the personal email at exit is built by the lifecycle (onboarding / exit) batch.
const ALUMNI_YEARS = 7;
const PORTAL_MINUTES = 30;

interface Field {
  key: string;
  label: string;
}
interface Template {
  key: string;
  version: number;
  /** Fields the template itself needs, beyond what the law asks. */
  fields: Field[];
  /** Fields that hold lists of { label, amount } lines. */
  lines: string[];
}
const TEMPLATES: Record<IssueDocumentDto['kind'], Template> = {
  payslip: { key: 'payslip-starter', version: 1, fields: [{ key: 'payDate', label: 'Pay date' }], lines: ['earnings', 'deductions'] },
  revision_letter: { key: 'revision-letter-starter', version: 1, fields: [{ key: 'employeeName', label: 'Name' }, { key: 'effectiveFrom', label: 'Effective from' }, { key: 'newAnnualCtc', label: 'New annual cost to company' }, { key: 'signatory', label: 'Signed by' }], lines: [] },
  payment_advice: { key: 'payment-advice-starter', version: 1, fields: [{ key: 'employeeName', label: 'Name' }, { key: 'amount', label: 'Amount' }, { key: 'paidOn', label: 'Paid on' }, { key: 'reference', label: 'Bank reference' }], lines: [] },
};
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
/** Indian grouping (12,34,567.00); money is Decimal text, never a JS number. */
export function money(s: string): string {
  const [i, f] = new Prisma.Decimal(s).toFixed(2).split('.');
  const head = i.slice(0, -3);
  return `Rs. ${head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},` : ''}${i.slice(-3)}.${f}`;
}

const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

type Doc = Prisma.PayDocumentGetPayload<object>;

@Injectable()
export class PayDocumentsService {
  private readonly logger = new Logger(PayDocumentsService.name);
  private readonly signer = dscSigner();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: PayFileStore,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly otp: OtpService,
    @Inject(DSC_ROOTS) private readonly roots: TrustedRoots,
    @Inject(DSC_REVOCATION) private readonly revocation: RevocationChecker,
  ) {}

  /** The mandatory fields of a kind on a date: the template's own and, for a payslip, the law's (P07, locked). */
  private async mandatory(tx: Tx, kind: IssueDocumentDto['kind'], on: string): Promise<Field[]> {
    const t = TEMPLATES[kind];
    if (kind !== 'payslip') return t.fields;
    const rs = await tx.statutoryRuleSet.findFirst({ where: { statute: 'IN.WAGESLIP', jurisdiction: 'IN', validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] }, orderBy: { validFrom: 'desc' } });
    if (!rs) throw new ConflictException('The wage-slip rules are not loaded for this date. YukthiX support has to publish them first.');
    return [...(rs.values as unknown as { mandatory: Field[] }).mandatory, ...t.fields];
  }

  /** YX-DOC-07: every mandatory field filled; amounts as rupees and paise; nothing outside the template (YX-DOC-08). */
  private check(fields: Record<string, unknown>, required: Field[], t: Template): Record<string, unknown> {
    const allowed = new Set([...required.map((f) => f.key), ...t.lines]);
    const extra = Object.keys(fields).filter((k) => !allowed.has(k));
    if (extra.length) throw new BadRequestException(`These fields are not in the template: ${extra.slice(0, 5).join(', ')}.`);
    const missing = required.filter((f) => {
      const v = fields[f.key];
      return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
    });
    if (missing.length) throw new BadRequestException({ statusCode: 400, code: 'DOC_FIELDS_MISSING', message: `Fill these before issuing: ${missing.map((f) => f.label).join(', ')}.`, missing: missing.map((f) => f.key) });
    for (const k of t.lines) {
      const v = fields[k];
      if (v === undefined) continue;
      if (!Array.isArray(v) || v.length > 40 || v.some((l) => !l || typeof l !== 'object' || typeof (l as { label?: unknown }).label !== 'string' || !MONEY.test(String((l as { amount?: unknown }).amount)))) throw new BadRequestException(`List each line of ${k} with a label and an amount in rupees (e.g. 12500.00).`);
    }
    for (const [k, v] of Object.entries(fields)) {
      if (t.lines.includes(k)) continue;
      if (typeof v !== 'string' && typeof v !== 'number') throw new BadRequestException(`${k} must be text.`);
      if (String(v).length > 200) throw new BadRequestException(`${k} is too long.`);
    }
    return fields;
  }

  private render(kind: string, title: string, referenceNo: string, code: string | null, fields: Record<string, unknown>, required: Field[], t: Template, issuedAt: Date, local: LocalLanguage | null = null): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: title, Author: String(fields.employerName ?? 'YukthiX'), CreationDate: issuedAt } });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      if (local) doc.fontSize(15).font(join(FONT_DIR, FONT_FILE[local])).text(LABELS[local].payslip).font('Helvetica');
      doc.fontSize(15).text(title);
      doc.fontSize(9).fillColor('#444').text(`Reference ${referenceNo}`).fillColor('#000').moveDown();
      for (const f of required) {
        const v = fields[f.key];
        if (t.lines.includes(f.key) || Array.isArray(v)) continue;
        doc.fontSize(10);
        writeLabel(doc, local, f.key, f.label, MONEY.test(String(v)) && /pay|amount|ctc/i.test(f.key) ? money(String(v)) : String(v ?? ''));
      }
      for (const k of t.lines) {
        const lines = (fields[k] as { label: string; amount: string }[] | undefined) ?? [];
        doc.moveDown(0.5).fontSize(11);
        writeLabel(doc, local, k, k === 'earnings' ? 'Earnings' : 'Deductions', '');
        for (const l of lines) doc.fontSize(10).text(`${l.label}  ${money(l.amount)}`);
        if (!lines.length) doc.fontSize(10).text('None');
      }
      doc.moveDown();
      if (code) doc.fontSize(9).fillColor('#444').text(`Check this ${KIND_LABEL[kind].toLowerCase()} at ${verifyLink(code)} (code ${code}).`);
      doc.end();
    });
  }

  /** The next reference number (no gaps: the counter row is held by this transaction, YX-DOC-09). */
  private async nextReference(tx: Tx, org: string, entityId: string, shortName: string, kind: string, year: number) {
    const [{ n }] = await tx.$queryRaw<{ n: number }[]>`
      INSERT INTO pay_document_counters (organization_id, legal_entity_id, kind, year, last_no) VALUES (${org}::uuid, ${entityId}::uuid, ${kind}, ${year}, 1)
      ON CONFLICT (organization_id, legal_entity_id, kind, year) DO UPDATE SET last_no = pay_document_counters.last_no + 1 RETURNING last_no AS n`;
    return referenceNo(shortName, KIND_CODE[kind], year, n);
  }

  /**
   * Issues a document (payroll.document.issue in its entity, step-up by the route). The confirmation phrase is
   * "ISSUE <kind code>". In 5c the run issues payslips through issueIn(); until then payroll enters the figures.
   */
  async issue(ctx: TenantContext, user: ScopeUser, dto: IssueDocumentDto) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    if (dto.confirmation.phrase !== `ISSUE ${KIND_CODE[dto.kind]}`) throw new BadRequestException(`Type ISSUE ${KIND_CODE[dto.kind]} to confirm.`);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const emp = await this.subject(tx, c.organizationId, dto.employeeId);
      await requireEntity(tx, c, v, 'payroll.document.issue', emp.legalEntityId);
      if (emp.userId === v.userId) throw new ForbiddenException('Someone else must issue your own pay documents.');
      await payScope(tx, [emp.legalEntityId]);
      const d = await this.issueIn(tx, c, { employeeId: dto.employeeId, legalEntityId: emp.legalEntityId, kind: dto.kind, month: dto.month ?? null, fields: dto.fields, supersedes: null, by: v.userId!, confirmation: dto.confirmation });
      return this.summary(d);
    });
  }

  /** Corrects an issued document: a new one, citing it; the old one stays, marked superseded (YX-DOC-09). */
  async supersede(ctx: TenantContext, user: ScopeUser, id: string, fields: Record<string, unknown>, reason: string, confirmation: ConfirmationDto) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.document.issue'));
      const old = await tx.payDocument.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!old) throw new NotFoundException('Not found');
      if (old.status !== 'issued') throw new ConflictException('Only an issued document can be corrected.');
      if (!(old.kind in TEMPLATES)) throw new ConflictException('This kind of document is corrected where it is made (its statutory form), not here.');
      if (confirmation.phrase !== `CORRECT ${old.referenceNo}`) throw new BadRequestException(`Type CORRECT ${old.referenceNo} to confirm.`);
      const emp = await this.subject(tx, c.organizationId, old.employeeId);
      if (emp.userId === v.userId) throw new ForbiddenException('Someone else must correct your own pay documents.');
      const d = await this.issueIn(tx, c, { employeeId: old.employeeId, legalEntityId: old.legalEntityId, kind: old.kind as IssueDocumentDto['kind'], month: old.periodStart ? dateOf(old.periodStart).slice(0, 7) : null, fields, supersedes: old, by: v.userId!, confirmation, reason });
      return this.summary(d);
    });
  }

  private async subject(tx: Tx, org: string, employeeId: string) {
    const [e] = await tx.$queryRaw<{ legalEntityId: string; userId: string | null; name: string; exitedOn: Date | null }[]>`
      SELECT m.legal_entity_id::text AS "legalEntityId", e.user_id::text AS "userId", concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.exited_on AS "exitedOn"
      FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
      WHERE e.organization_id = ${org}::uuid AND e.id = ${employeeId}::uuid ORDER BY m.joined_on DESC LIMIT 1`;
    if (!e) throw new NotFoundException('Not found');
    return e;
  }

  /** The shared issue step (the pay guard must already allow the entity). */
  async issueIn(tx: Tx, c: CompanyContext, a: { employeeId: string; legalEntityId: string; kind: IssueDocumentDto['kind']; month: string | null; fields: Record<string, unknown>; supersedes: Doc | null; by: string; confirmation: ConfirmationDto; reason?: string }) {
    const org = c.organizationId;
    const t = TEMPLATES[a.kind];
    const today = todayIst();
    const required = await this.mandatory(tx, a.kind, a.month ? `${a.month}-01` : today);
    const fields = this.check(a.fields, required, t);
    const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: a.legalEntityId }, select: { shortName: true, name: true } });
    const issuedAt = new Date();
    const ref = await this.nextReference(tx, org, a.legalEntityId, entity.shortName, a.kind, Number(today.slice(0, 4)));
    const code = verifyCode();
    const title = `${KIND_LABEL[a.kind]}${a.month ? ` · ${new Date(`${a.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}` : ''}${a.supersedes ? ' (revised)' : ''}`;
    // 5b-D2: a payslip carries the second language of its entity's payslip layout in use.
    const layout = a.kind === 'payslip' ? await tx.payslipLayout.findFirst({ where: { organizationId: org, legalEntityId: a.legalEntityId, payGroupId: null, status: 'active' }, select: { languages: true } }) : null;
    const unsigned = await this.render(a.kind, title, ref, code, fields, required, t, issuedAt, localOf(layout?.languages));
    let pdf = unsigned;
    let signature: 'none' | 'awaiting' | 'signed' = 'none';
    let signatureRef: string | null = null;
    if (DSC_KINDS.has(a.kind)) {
      const signed = await this.signer.sign(pdf, { organizationId: org, legalEntityId: a.legalEntityId, referenceNo: ref });
      if (signed) [pdf, signature, signatureRef] = [signed.pdf, 'signed', signed.ref];
      else signature = 'awaiting';
    }
    const years = Number(await settingFor(tx, c, 'payroll.document_retention_years', { legalEntityId: a.legalEntityId }));
    const retainUntil = new Date(`${today}T00:00:00Z`);
    retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + years);
    const fileRef = await this.files.put(`pay-documents/${org}/${a.legalEntityId}/${randomBytes(12).toString('hex')}.pdf`, pdf);
    const d = await tx.payDocument.create({
      data: {
        organizationId: org,
        legalEntityId: a.legalEntityId,
        employeeId: a.employeeId,
        kind: a.kind,
        title,
        periodStart: a.month ? asDate(`${a.month}-01`) : null,
        templateKey: t.key,
        templateVersion: t.version,
        referenceNo: ref,
        fileRef,
        sha256: sha256(pdf),
        // D1: what a signed upload must start with, byte for byte.
        unsignedSha256: sha256(unsigned),
        unsignedBytes: unsigned.length,
        verifyCode: code,
        status: signature === 'awaiting' ? 'awaiting_signature' : 'issued',
        supersedesId: a.supersedes?.id ?? null,
        signature,
        signatureRef,
        signedAt: signature === 'signed' ? issuedAt : null,
        issuedBy: a.by,
        issuedAt,
        retainUntil,
      },
    });
    if (a.supersedes) await tx.payDocument.update({ where: { id: a.supersedes.id }, data: { status: 'superseded', supersededById: d.id } });
    await audit(tx, c, a.supersedes ? 'payroll.document.superseded' : 'payroll.document.issued', 'pay_document', d.id, {
      legalEntityId: a.legalEntityId,
      employeeId: a.employeeId,
      kind: a.kind,
      referenceNo: ref,
      sha256: d.sha256,
      templateVersion: t.version,
      supersedes: a.supersedes?.referenceNo ?? null,
      reason: a.reason ?? null,
      confirmed: { phrase: a.confirmation.phrase, impact: a.confirmation.impact },
    });
    return d;
  }

  private summary(d: Doc) {
    return { id: d.id, kind: d.kind, kindLabel: KIND_LABEL[d.kind], title: d.title, referenceNo: d.referenceNo, status: d.status, signature: d.signature, issuedAt: d.issuedAt, verifyCode: d.verifyCode, sha256: d.sha256, month: d.periodStart ? dateOf(d.periodStart).slice(0, 7) : null, supersedesId: d.supersedesId, supersededById: d.supersededById, purged: Boolean(d.purgedAt) };
  }

  /** Documents of the entities in scope (payroll.document.view), optionally of one person. */
  async list(ctx: TenantContext, user: ScopeUser, q: { legalEntityId?: string; employeeId?: string }) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    if (!has(v, 'payroll.document.view')) throw new ForbiddenException('Pay documents need payroll.document.view.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = (await entitiesFor(tx, c, v, 'payroll.document.view')).filter((id) => !q.legalEntityId || id === q.legalEntityId);
      await payScope(tx, ids);
      const rows = await tx.payDocument.findMany({ where: { organizationId: org, legalEntityId: { in: ids }, ...(q.employeeId ? { employeeId: q.employeeId } : {}) }, orderBy: { issuedAt: 'desc' }, take: 200 });
      const people = new Map((await tx.employee.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } })).map((e) => [e.id, [e.preferredName ?? e.givenName, e.familyName].filter(Boolean).join(' ')]));
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true } });
      const canIssue = new Set(await entitiesFor(tx, c, v, 'payroll.document.issue'));
      return { entities: entities.map((e) => ({ ...e, canIssue: canIssue.has(e.id) })), documents: rows.map((r) => ({ ...this.summary(r), employeeId: r.employeeId, person: people.get(r.employeeId) ?? '', legalEntityId: r.legalEntityId })) };
    });
  }

  /** One's own issued documents (Employee @ self, no key). */
  async mine(ctx: TenantContext, user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Pay is not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await tx.employee.findMany({ where: { organizationId: c.organizationId, userId: c.userId ?? '00000000-0000-0000-0000-000000000000' }, select: { id: true } });
      // The pay guard opens only the person's own rows here (app_current_employee_ids).
      const rows = await tx.payDocument.findMany({ where: { organizationId: c.organizationId, employeeId: { in: me.map((e) => e.id) }, status: { in: ['issued', 'superseded'] } }, orderBy: { issuedAt: 'desc' }, take: 200 });
      return rows.map((r) => this.summary(r));
    });
  }

  /**
   * The file, checked against its stored hash before it is served. Own documents: no key. Someone else's: the
   * payroll.document.view key in its entity, and the view is recorded once per 30 minutes (YX-AUD-04).
   */
  async file(ctx: TenantContext, user: ScopeUser, id: string): Promise<{ file: Buffer; name: string }> {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.document.view'));
      const d = await tx.payDocument.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!d) throw new NotFoundException('Not found');
      const own = Boolean(await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: d.employeeId, userId: v.userId }, select: { id: true } }));
      if (!own) await PayAuditService.sensitiveView(tx, c, v.userId!, 'pay_document', d.id, 'pay', { legalEntityId: d.legalEntityId, employeeId: d.employeeId, kind: d.kind });
      return { file: await this.bytes(d), name: `${d.referenceNo.replace(/[^A-Za-z0-9]+/g, '-')}.pdf` };
    });
  }

  private async bytes(d: Doc) {
    if (!d.fileRef) throw new ConflictException({ statusCode: 409, code: 'DOC_PURGED', message: 'This document was deleted at the end of its retention period. Its record and verify code are kept.' });
    const file = await this.files.get(d.fileRef);
    if (sha256(file) !== d.sha256) {
      this.logger.error(`Pay document ${d.id} does not match its hash`);
      throw new ConflictException({ statusCode: 409, code: 'DOC_TAMPERED', message: 'This file does not match the document that was issued, so it is not shown. YukthiX support has been told.' });
    }
    return file;
  }

  /**
   * The signing helper uploads the PDF the company's USB token signed (§19 D4). Founder decision D1 (9 Oct 2026): it is
   * accepted only when the signature is valid, the signer chains to a CCA root, is in date and not revoked, and the
   * signed bytes are the document we issued (signed-pdf.ts). The check runs outside the database transaction (it may
   * ask the CA's OCSP responder); acceptance and refusal are both audited.
   */
  async attachSignature(ctx: TenantContext, user: ScopeUser, id: string, file: Buffer | undefined) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    if (!file?.length) throw new BadRequestException('Attach the signed PDF.');
    const d = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.document.issue'));
      const doc = await tx.payDocument.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!doc) throw new NotFoundException('Not found');
      if (doc.status !== 'awaiting_signature' || !doc.unsignedBytes) throw new ConflictException('This document is not waiting for a signature.');
      return doc;
    });
    let signer;
    try {
      signer = await verifySignedPdf(file, { sha256: d.unsignedSha256, bytes: d.unsignedBytes! }, await this.roots.get(), this.revocation);
    } catch (e) {
      if (!(e instanceof SignatureRefused)) throw e;
      await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'payroll.document.signature_refused', 'pay_document', d.id, { legalEntityId: d.legalEntityId, referenceNo: d.referenceNo, reason: e.message, uploadSha256: sha256(file) }));
      throw new BadRequestException({ statusCode: 400, code: 'SIGNATURE_REFUSED', message: e.message });
    }
    const fileRef = await this.files.put(`pay-documents/${d.organizationId}/${d.legalEntityId}/${randomBytes(12).toString('hex')}.pdf`, file);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, [d.legalEntityId]);
      const done = await tx.payDocument.updateMany({ where: { organizationId: c.organizationId, id: d.id, status: 'awaiting_signature' }, data: { status: 'issued', signature: 'signed', fileRef, sha256: sha256(file), signatureRef: `${signer.issuer} #${signer.serial}`.slice(0, 200), signedAt: new Date() } });
      if (!done.count) throw new ConflictException('This document was signed meanwhile.');
      await audit(tx, c, 'payroll.document.signed', 'pay_document', d.id, { legalEntityId: d.legalEntityId, referenceNo: d.referenceNo, signer: signer.subject, issuer: signer.issuer, serial: signer.serial, sha256: sha256(file), unsignedSha256: d.unsignedSha256 });
      if (d.fileRef) await this.files.drop(d.fileRef).catch(() => undefined);
      return { id: d.id, status: 'issued', signer: signer.subject, issuer: signer.issuer };
    });
  }

  // ------------------------------------------------------------------------------------------ public verify (YX-DOC-11)

  /** The public page shows only the company, the kind, the person's name, the date and whether it is current. */
  async verify(code: string) {
    if (!VERIFY_CODE.test(code)) throw new NotFoundException('No document has this code.');
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_verify_code', ${code}, true)`;
      const d = await tx.payDocument.findFirst({ where: { verifyCode: code }, select: { organizationId: true, employeeId: true, kind: true, issuedAt: true, status: true } });
      if (!d || d.status === 'awaiting_signature') {
        // Lifecycle letters share this page (D10).
        const other = await verifyElsewhere(code);
        if (other) return other;
        throw new NotFoundException('No document has this code.');
      }
      const [org, emp] = await Promise.all([tx.organization.findUnique({ where: { id: d.organizationId }, select: { name: true } }), tx.employee.findFirst({ where: { organizationId: d.organizationId, id: d.employeeId }, select: { givenName: true, familyName: true, preferredName: true } })]);
      return { company: org?.name ?? '', kind: KIND_LABEL[d.kind], name: emp ? [emp.preferredName ?? emp.givenName, emp.familyName].filter(Boolean).join(' ') : '', issuedOn: d.issuedAt.toISOString().slice(0, 10), status: d.status === 'issued' ? 'current' : 'superseded' };
    });
  }

  // ------------------------------------------------------------------------------------------ nominees and alumni (PAY-1.10)

  /** HR releases a deceased employee's documents to a nominee (payroll.document.issue in the entity), audited. */
  async addNominee(ctx: TenantContext, user: ScopeUser, dto: NomineeDto) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const emp = await this.subject(tx, c.organizationId, dto.employeeId);
      await requireEntity(tx, c, v, 'payroll.document.issue', emp.legalEntityId);
      if (!emp.exitedOn) throw new BadRequestException('Nominees get access only after the employment has ended.');
      await payScope(tx, [emp.legalEntityId]);
      const email = dto.email.toLowerCase();
      const n = await tx.payDocumentNominee.create({ data: { organizationId: c.organizationId, legalEntityId: emp.legalEntityId, employeeId: dto.employeeId, name: dto.name, emailHash: this.crypto.hmac('pay-portal-email', email), emailEnc: this.crypto.encrypt(email), emailLast4: email.split('@')[0].slice(-4), validUntil: asDate(dto.validUntil), grantedBy: v.userId! } });
      await audit(tx, c, 'payroll.document.nominee_added', 'employee', dto.employeeId, { legalEntityId: emp.legalEntityId, nomineeId: n.id, validUntil: dto.validUntil });
      return { id: n.id };
    });
  }

  private otpKey(org: string, email: string) {
    return `pay-portal-otp:${org}:${this.crypto.hmac('pay-portal-email', email)}`;
  }

  /**
   * Who may sign in with this email: a former employee (their personal or work email) within 7 years of leaving, or a
   * nominee whose access has not ended. Run as the company, with the pay guard closed (only the employee row is read).
   */
  private async eligible(tx: Tx, org: string, email: string): Promise<{ employeeId: string; nomineeId: string | null } | null> {
    const today = todayIst();
    const [alumni] = await tx.$queryRaw<{ id: string }[]>`
      SELECT e.id::text FROM employees e
      JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
      LEFT JOIN employee_personal_details pd ON pd.organization_id = e.organization_id AND pd.employee_id = e.id
      WHERE e.organization_id = ${org}::uuid AND (lower(pd.personal_email) = ${email} OR lower(e.work_email) = ${email})
        AND m.exited_on IS NOT NULL AND m.exited_on <= ${today}::date AND m.exited_on + ${ALUMNI_YEARS}::int * interval '1 year' >= ${today}::date
        AND NOT EXISTS (SELECT 1 FROM employments x WHERE x.organization_id = e.organization_id AND x.employee_id = e.id AND x.exited_on IS NULL)
      ORDER BY m.exited_on DESC LIMIT 1`;
    if (alumni) return { employeeId: alumni.id, nomineeId: null };
    await tx.$executeRaw`SELECT set_config('app.pay_entities', (SELECT coalesce(array_agg(id)::text, '{}') FROM legal_entities WHERE organization_id = ${org}::uuid), true)`;
    const n = await tx.payDocumentNominee.findFirst({ where: { organizationId: org, emailHash: this.crypto.hmac('pay-portal-email', email), revokedAt: null, validUntil: { gte: asDate(today) } } });
    await payScope(tx, []);
    return n ? { employeeId: n.employeeId, nomineeId: n.id } : null;
  }

  private async orgOf(slug: string) {
    const o = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findUnique({ where: { slug }, select: { id: true } }));
    if (!o) throw new NotFoundException('No such company.');
    return o.id;
  }

  /** Step 1: a code by email. The same answer whether or not the email may sign in. */
  async portalCode(slug: string, dto: PortalEmailDto, ip: string | null) {
    const org = await this.orgOf(slug);
    const email = dto.email.toLowerCase();
    await this.otp.reserveSend(`pay-portal:${org}:${email}`, ip);
    const who = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => this.eligible(tx, org, email));
    if (who) {
      const code = await this.otp.issue(this.otpKey(org, email), { email });
      this.otp.deliver('email', email, code, 'sign_in', org, { userId: '' });
    }
    return { sent: true };
  }

  /** Step 2: a right code starts a 30-minute read-only session for that one person's documents. */
  async portalVerify(slug: string, dto: PortalVerifyDto) {
    const org = await this.orgOf(slug);
    const email = dto.email.toLowerCase();
    const data = await this.otp.check(this.otpKey(org, email), dto.code);
    if (!data || data.email !== email) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const who = await this.eligible(tx, org, email);
      if (!who) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + PORTAL_MINUTES * 60_000);
      await tx.payPortalSession.create({ data: { organizationId: org, employeeId: who.employeeId, nomineeId: who.nomineeId, tokenHash: tokenHash(token), expiresAt } });
      await audit(tx, { organizationId: org, isSuperAdmin: false }, 'payroll.portal.signed_in', 'employee', who.employeeId, { nominee: Boolean(who.nomineeId) });
      return { token, expiresAt };
    });
  }

  /** Every portal read runs with app.pay_portal_employee: the database keeps the session to that one person's documents. */
  private async inPortal<T>(slug: string, token: string | undefined, fn: (tx: Tx, s: { org: string; employeeId: string; nomineeId: string | null }) => Promise<T>): Promise<T> {
    if (!token) throw new UnauthorizedException('Sign in again.');
    const org = await this.orgOf(slug);
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const s = await tx.payPortalSession.findFirst({ where: { organizationId: org, tokenHash: tokenHash(token), endedAt: null, expiresAt: { gt: new Date() } } });
      if (!s) throw new UnauthorizedException('Sign in again.');
      await tx.$executeRaw`SELECT set_config('app.pay_portal_employee', ${s.employeeId}, true)`;
      return fn(tx, { org, employeeId: s.employeeId, nomineeId: s.nomineeId });
    });
  }

  async portalDocuments(slug: string, token: string | undefined) {
    return this.inPortal(slug, token, async (tx, s) => {
      const rows = await tx.payDocument.findMany({ where: { organizationId: s.org, employeeId: s.employeeId, status: { in: ['issued', 'superseded'] } }, orderBy: { issuedAt: 'desc' }, take: 200 });
      return rows.map((r) => this.summary(r));
    });
  }

  async portalFile(slug: string, token: string | undefined, id: string) {
    return this.inPortal(slug, token, async (tx, s) => {
      const d = await tx.payDocument.findFirst({ where: { organizationId: s.org, id, employeeId: s.employeeId, status: { in: ['issued', 'superseded'] } } });
      if (!d) throw new NotFoundException('Not found');
      await audit(tx, { organizationId: s.org, isSuperAdmin: false }, 'payroll.portal.document_downloaded', 'pay_document', d.id, { employeeId: s.employeeId, nomineeId: s.nomineeId });
      return { file: await this.bytes(d), name: `${d.referenceNo.replace(/[^A-Za-z0-9]+/g, '-')}.pdf` };
    });
  }

  async portalSignOut(slug: string, token: string | undefined) {
    if (!token) return { ok: true };
    const org = await this.orgOf(slug);
    await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.payPortalSession.updateMany({ where: { organizationId: org, tokenHash: tokenHash(token), endedAt: null }, data: { endedAt: new Date() } }));
    return { ok: true };
  }

  // ------------------------------------------------------------------------------------------ retention (YX-DOC-13)

  /** Daily: files past their retention date are deleted (the record, hash and verify code stay), unless on legal hold. */
  async purgeExpired(now = new Date()): Promise<number> {
    const today = now.toISOString().slice(0, 10);
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM legal_entities`);
    let n = 0;
    for (const { id: org } of orgs) {
      await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
        const entities = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
        await payScope(tx, entities);
        const held = (await tx.auditLegalHold.findMany({ where: { organizationId: org, releasedAt: null, employeeId: { not: null } }, select: { employeeId: true } })).map((h) => h.employeeId!);
        const due = await tx.payDocument.findMany({ where: { organizationId: org, purgedAt: null, retainUntil: { lt: asDate(today) }, employeeId: { notIn: held } }, take: 500 });
        for (const d of due) {
          await tx.payDocument.update({ where: { id: d.id }, data: { purgedAt: now, fileRef: null } });
          await audit(tx, { organizationId: org, isSuperAdmin: false }, 'payroll.document.purged', 'pay_document', d.id, { legalEntityId: d.legalEntityId, referenceNo: d.referenceNo, retainedUntil: dateOf(d.retainUntil) });
          await this.files.drop(d.fileRef!).catch((e) => this.logger.warn(`pay document file not removed: ${(e as Error).message}`));
          n++;
        }
      });
    }
    return n;
  }
}
