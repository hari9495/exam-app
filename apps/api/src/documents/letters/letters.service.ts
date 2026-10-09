import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Certificate } from 'pkijs';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../../org-structure/org-structure.service';
import { todayIst } from '../../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../../access/scope';
import { ApprovalsEngine, type Notice } from '../../workflow/approvals-engine.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AutomationService } from '../../rules-engine/automation.service';
import { OtpService } from '../../auth/otp.service';
import { FilesService } from '../files.service';
import { FileStore, sha256 } from '../file-store';
import { ownOf, reachesPerson } from '../person-access';
import { dscSigner } from '../signing';
import { DSC_REVOCATION, DSC_ROOTS, SignatureRefused, verifySignedPdf, type RevocationChecker } from '../signed-pdf';
import { VERIFY_CODE, referenceNo, registerVerifier, verifyCode, verifyLink } from '../verify-code';
import { TemplateProblem, fillDocx, templateFields } from './docx';
import { FIELDS, STARTER_LETTERS, letterData, missingFields, sampleData, starterDocx, suggest } from './fields';
import { PdfConverter, acceptanceCopy, converterFromEnv, previewMark, stampPdf } from './pdf';

// LIFE-2.04 … 2.07 letters (P05 §4.3 / §4.4; design §9.3–§9.6), reusing payroll 5a's pieces (D10): the reference
// number format, the verify code and public page, and the DSC signing adapter with its signed-PDF check.
//   templates  Word files checked for safety and against the field registry; active only after a sample preview;
//   issue      the data is frozen when HR asks; types that need approval go to the entity's signatory (P03); then the
//              number and code are taken (gap-free, never reused), the letter is filled, turned into PDF, stamped
//              (reference, check line, QR, signature image) and, for DSC types, signed by the company's adapter;
//              an issued letter never changes (database trigger); a correction supersedes it;
//   e-sign     the person reads it, ticks "I accept" and enters a one-time code (G-19 disclosure once); a sealed
//              acceptance copy (the issued pages + a certificate page) is stored; the issued file is never touched.

/** Letters an employee may get for themselves at once (P05 Q8). */
export const SELF_CERTIFICATES = ['employment_certificate'];
type IssueInput = { letterType: string; personId: string; signatoryId?: string | null; subjectType?: string; subjectId?: string; supersedesId?: string | null };
const KEYS = ['letter.template.manage', 'letter.issue', 'letter.signatory.manage', 'employee.personal.view'] as const;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const REQUEST_TYPE = 'letter.issue';
export const ESIGN_NOTICE = 'G-19 v1';
const TYPE_CODE: Record<string, string> = { appointment: 'APT', welcome: 'WEL', confirmation: 'CNF' };
const typeCode = (t: string) => TYPE_CODE[t] ?? t.slice(0, 4).toUpperCase();
type Template = Prisma.LetterTemplateGetPayload<object>;
type Letter = Prisma.LetterIssueGetPayload<object>;
export interface SignEvidence {
  ip: string | null;
  device: string | null;
  channel: 'email' | 'sms';
  assurance: string;
  who: string;
}

@Injectable()
export class LettersService implements OnModuleInit {
  private readonly logger = new Logger(LettersService.name);
  private readonly converter: PdfConverter | null = converterFromEnv();
  private readonly signer = dscSigner();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
    private readonly store: FileStore,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly approvals: ApprovalsEngine,
    private readonly notifications: NotificationsService,
    private readonly automation: AutomationService,
    private readonly otp: OtpService,
    @Inject(DSC_ROOTS) private readonly roots: Certificate[],
    @Inject(DSC_REVOCATION) private readonly revocation: RevocationChecker,
  ) {}

  onModuleInit() {
    this.approvals.register({
      key: REQUEST_TYPE,
      label: 'Letter',
      risk: 'normal',
      autoActions: false,
      requesterLink: () => '/yx/people/letters',
      cardPreview: async () => 'neutral',
      onDecided: async (tx, req, outcome) => {
        const n = await tx.letterIssue.updateMany({ where: { organizationId: req.organizationId, id: req.subjectId, status: 'pending_approval' }, data: { status: outcome === 'approved' ? 'rendering' : 'rejected' } });
        if (n.count && outcome === 'approved') await tx.eventOutbox.create({ data: { organizationId: req.organizationId, eventType: 'letter.render_due', payload: { letterIssueId: req.subjectId } } });
      },
    });
    this.automation.subscribe(async (ev) => {
      if (ev.type === 'letter.render_due' && typeof ev.payload.letterIssueId === 'string') await this.render(ev.organizationId, ev.payload.letterIssueId);
    });
    // The public check page (payroll's) also finds letters.
    registerVerifier((code) => this.verify(code));
  }

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  private seal = (data: unknown) => this.crypto.encrypt(JSON.stringify(data));
  private open = (s: string) => JSON.parse(this.crypto.decrypt(s)) as Record<string, string | boolean>;

  // ------------------------------------------------------------------------------------------ templates (LIFE-2.04)

  private templateView(t: Template) {
    return { id: t.id, letterType: t.letterType, name: t.name, legalEntityId: t.legalEntityId, language: t.language, source: t.source, fields: t.fields, requiresApproval: t.requiresApproval, personSigns: t.personSigns, companyDsc: t.companyDsc, version: t.version, status: t.status, previewViewed: Boolean(t.previewViewedAt), createdAt: t.createdAt.toISOString() };
  }

  private requireKey(v: Viewer, key: string, legalEntityId?: string | null) {
    if (!v.grants.has(key) || v.actingForOther) throw new ForbiddenException('You cannot do this.');
    // Company configuration: a legal-entity grant reaches only that entity's templates and signatories.
    if (legalEntityId === undefined || tenantWide(v, key)) return;
    if (!legalEntityId || !(v.scopes.get(key) ?? []).some((s) => s.type === 'legal_entity' && s.id === legalEntityId)) throw new ForbiddenException(legalEntityId ? 'You cannot change this for that legal entity.' : 'Only a company-wide admin can change company-wide letter set-up.');
  }

  async templates(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('letter.template.manage') && !v.grants.has('letter.issue')) throw new ForbiddenException('You cannot see letter templates.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.letterTemplate.findMany({ where: { organizationId: c.organizationId, status: { not: 'retired' } }, orderBy: [{ letterType: 'asc' }, { version: 'desc' }] });
      return {
        templates: rows.map((t) => this.templateView(t)),
        starters: STARTER_LETTERS.map((s) => ({ letterType: s.letterType, name: s.name, added: rows.some((r) => r.letterType === s.letterType && r.source === 'starter') })),
        fields: Object.entries(FIELDS).map(([key, f]) => ({ key, label: f.label, personal: f.cls === 'personal', flag: Boolean(f.flag) })),
      };
    });
  }

  /** Checks a Word file: safe, placeholders all known (with "did you mean"). */
  private checkTemplate(buf: Buffer): string[] {
    let fields: string[];
    try {
      fields = templateFields(buf);
    } catch (e) {
      if (e instanceof TemplateProblem) throw new BadRequestException({ statusCode: 400, code: 'TEMPLATE_REFUSED', message: e.message });
      throw e;
    }
    const unknown = fields.filter((f) => !FIELDS[f]);
    if (unknown.length) {
      throw new BadRequestException({ statusCode: 400, code: 'TEMPLATE_FIELDS', message: `These placeholders are not known: ${unknown.map((u) => `{{${u}}}${suggest(u) ? ` (did you mean {{${suggest(u)}}}?)` : ''}`).join(', ')}.`, errors: Object.fromEntries(unknown.map((u) => [u, suggest(u) ?? ''])) });
    }
    return fields;
  }

  private async createTemplate(ctx: TenantContext, user: ScopeUser, input: { letterType: string; name: string; legalEntityId: string | null; requiresApproval: boolean; personSigns: boolean; companyDsc: boolean; source: 'upload' | 'starter'; fileName: string; buf: Buffer }) {
    const v = await this.viewer(user);
    this.requireKey(v, 'letter.template.manage', input.legalEntityId);
    const fields = this.checkTemplate(input.buf);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (input.legalEntityId && !(await tx.legalEntity.findFirst({ where: { organizationId: org, id: input.legalEntityId }, select: { id: true } }))) throw new BadRequestException('No such legal entity.');
      const file = await this.files.storeIn(tx, c, { area: 'letter-templates', name: input.fileName, data: input.buf, allowedMime: [DOCX], maxMb: 20, via: input.source === 'starter' ? 'system' : 'staff' });
      const prev = await tx.letterTemplate.findFirst({ where: { organizationId: org, letterType: input.letterType, legalEntityId: input.legalEntityId, language: 'en' }, orderBy: { version: 'desc' } });
      const t = await tx.letterTemplate.create({
        data: { organizationId: org, letterType: input.letterType, name: input.name, legalEntityId: input.legalEntityId, source: input.source, fileId: file.id, fields, requiresApproval: input.requiresApproval, personSigns: input.personSigns, companyDsc: input.companyDsc, version: (prev?.version ?? 0) + 1, status: 'draft', createdBy: c.userId ?? null },
      });
      await audit(tx, c, 'letter.template.added', 'letter_template', t.id, { letterType: t.letterType, version: t.version, source: t.source, fields });
      return { t, fileId: file.id, org };
    });
    await this.files.scan(out.org, out.fileId);
    return this.templateView(out.t);
  }

  uploadTemplate(ctx: TenantContext, user: ScopeUser, dto: { letterType: string; name: string; legalEntityId?: string | null; requiresApproval: boolean; personSigns: boolean; companyDsc?: boolean }, file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('Choose a Word (.docx) file.');
    return this.createTemplate(ctx, user, { letterType: dto.letterType, name: dto.name, legalEntityId: dto.legalEntityId ?? null, requiresApproval: dto.requiresApproval, personSigns: dto.personSigns, companyDsc: Boolean(dto.companyDsc), source: 'upload', fileName: file.originalname, buf: file.buffer });
  }

  useStarter(ctx: TenantContext, user: ScopeUser, letterType: string) {
    const s = STARTER_LETTERS.find((x) => x.letterType === letterType);
    const buf = starterDocx(letterType);
    if (!s || !buf) throw new NotFoundException('No such starter letter.');
    return this.createTemplate(ctx, user, { letterType: s.letterType, name: s.name, legalEntityId: null, requiresApproval: s.requiresApproval, personSigns: s.personSigns, companyDsc: false, source: 'starter', fileName: `${s.letterType}.docx`, buf });
  }

  private async templateRow(tx: Tx, org: string, id: string) {
    const t = await tx.letterTemplate.findFirst({ where: { organizationId: org, id } });
    if (!t) throw new NotFoundException('No such letter template.');
    return t;
  }

  private async fileBytes(tx: Tx, org: string, fileId: string) {
    return this.files.bytes(await tx.file.findFirstOrThrow({ where: { organizationId: org, id: fileId } }));
  }

  private async toPdf(docx: Buffer) {
    if (!this.converter) throw new ConflictException('Letters cannot be turned into PDF yet: the PDF service is not set up. Ask your YukthiX contact.');
    return this.converter.toPdf(docx, { pdfA: false });
  }

  /** The sample preview (YX-DOC-15): viewing it is what allows the template to be switched on. */
  async templatePreview(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.requireKey(v, 'letter.template.manage');
    const docx = await inCompany(this.tenantPrisma, ctx, async (tx, c) => this.fileBytes(tx, c.organizationId, (await this.templateRow(tx, c.organizationId, id)).fileId));
    const pdf = await previewMark(await this.toPdf(fillDocx(docx, sampleData())));
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await tx.letterTemplate.updateMany({ where: { organizationId: c.organizationId, id, previewViewedAt: null }, data: { previewViewedBy: c.userId ?? null, previewViewedAt: new Date() } });
      await audit(tx, c, 'letter.template.previewed', 'letter_template', id);
    });
    return { file: pdf, name: 'preview.pdf', contentType: 'application/pdf' };
  }

  async templateDocx(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.requireKey(v, 'letter.template.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await this.templateRow(tx, c.organizationId, id);
      return { file: await this.fileBytes(tx, c.organizationId, t.fileId), name: `${t.letterType}-v${t.version}.docx`, contentType: DOCX };
    });
  }

  async setTemplateStatus(ctx: TenantContext, user: ScopeUser, id: string, status: 'active' | 'retired') {
    const v = await this.viewer(user);
    this.requireKey(v, 'letter.template.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await this.templateRow(tx, c.organizationId, id);
      this.requireKey(v, 'letter.template.manage', t.legalEntityId);
      if (status === 'active') {
        if (!t.previewViewedAt) throw new ConflictException('Look at the sample preview before switching this template on.');
        await tx.letterTemplate.updateMany({ where: { organizationId: c.organizationId, letterType: t.letterType, legalEntityId: t.legalEntityId, language: t.language, status: 'active', id: { not: t.id } }, data: { status: 'retired' } });
      }
      await tx.letterTemplate.update({ where: { id: t.id }, data: { status } });
      await audit(tx, c, `letter.template.${status === 'active' ? 'activated' : 'retired'}`, 'letter_template', t.id, { letterType: t.letterType, version: t.version });
      return this.templateView({ ...t, status });
    });
  }

  // ------------------------------------------------------------------------------------------ signatories

  async signatories(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('letter.signatory.manage') && !v.grants.has('letter.issue')) throw new ForbiddenException('You cannot see signatories.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.signatory.findMany({ where: { organizationId: c.organizationId, active: true } });
      const users = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true, email: true } });
      return rows.map((r) => ({ id: r.id, legalEntityId: r.legalEntityId, userId: r.userId, name: users.find((u) => u.id === r.userId)?.name ?? '', title: r.title, hasSignatureImage: Boolean(r.signatureFileId) }));
    });
  }

  /** Who can be named a signatory: the company's active users (names only). */
  async signatoryCandidates(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    this.requireKey(v, 'letter.signatory.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) =>
      (await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 500 })).map((u) => ({ value: u.id, label: u.name || u.email })),
    );
  }

  async addSignatory(ctx: TenantContext, user: ScopeUser, dto: { legalEntityId: string; userId: string; title: string }, image: { originalname: string; buffer: Buffer } | undefined) {
    const v = await this.viewer(user);
    this.requireKey(v, 'letter.signatory.manage', dto.legalEntityId);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.user.findFirst({ where: { organizationId: org, id: dto.userId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active user.');
      if (!(await tx.legalEntity.findFirst({ where: { organizationId: org, id: dto.legalEntityId }, select: { id: true } }))) throw new BadRequestException('No such legal entity.');
      const file = image ? await this.files.storeIn(tx, c, { area: 'signatures', name: image.originalname, data: image.buffer, allowedMime: ['image/png', 'image/jpeg'], maxMb: 1, via: 'staff' }) : null;
      await tx.signatory.updateMany({ where: { organizationId: org, legalEntityId: dto.legalEntityId, userId: dto.userId, active: true }, data: { active: false } });
      const s = await tx.signatory.create({ data: { organizationId: org, legalEntityId: dto.legalEntityId, userId: dto.userId, title: dto.title, signatureFileId: file?.id ?? null, createdBy: c.userId ?? null } });
      await audit(tx, c, 'letter.signatory.added', 'signatory', s.id, { legalEntityId: dto.legalEntityId, userId: dto.userId, image: Boolean(file) });
      return { s, fileId: file?.id ?? null, org };
    });
    if (out.fileId) await this.files.scan(out.org, out.fileId);
    return { id: out.s.id };
  }

  async removeSignatory(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.requireKey(v, 'letter.signatory.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.signatory.findFirst({ where: { organizationId: c.organizationId, id, active: true } });
      if (!row) throw new NotFoundException('No such signatory.');
      this.requireKey(v, 'letter.signatory.manage', row.legalEntityId);
      const n = await tx.signatory.updateMany({ where: { organizationId: c.organizationId, id, active: true }, data: { active: false } });
      if (!n.count) throw new NotFoundException('No such signatory.');
      await audit(tx, c, 'letter.signatory.removed', 'signatory', id);
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------------------------------ issuing (LIFE-2.05)

  /** The active template for a type: the person's entity first, then company-wide. */
  private async activeTemplate(tx: Tx, org: string, letterType: string, legalEntityId: string) {
    const rows = await tx.letterTemplate.findMany({ where: { organizationId: org, letterType, status: 'active', language: 'en', OR: [{ legalEntityId }, { legalEntityId: null }] } });
    const t = rows.find((r) => r.legalEntityId === legalEntityId) ?? rows[0];
    if (!t) throw new BadRequestException(`There is no active ${letterType.replace(/_/g, ' ')} template yet. Switch one on in Settings › Letter templates.`);
    return t;
  }

  /** May the viewer issue letters to this person, with every field class the template uses? */
  private async mayIssue(tx: Tx, c: CompanyContext, v: Viewer, personId: string, fields: string[]) {
    const own = await ownOf(tx, c, v);
    if (v.actingForOther || own.personId === personId) throw new ForbiddenException('You cannot issue letters to yourself.');
    if (!(await reachesPerson(tx, c, v, 'letter.issue', personId, own))) throw new ForbiddenException('You cannot issue letters to this person.');
    if (fields.some((f) => FIELDS[f]?.cls === 'personal') && !(await reachesPerson(tx, c, v, 'employee.personal.view', personId, own))) throw new ForbiddenException('This letter uses personal details you cannot see (YX-DOC-08).');
  }

  private async signatoryFor(tx: Tx, org: string, legalEntityId: string, signatoryId?: string | null) {
    const rows = await tx.signatory.findMany({ where: { organizationId: org, legalEntityId, active: true }, orderBy: { createdAt: 'asc' } });
    const s = signatoryId ? rows.find((r) => r.id === signatoryId) : rows[0];
    if (signatoryId && !s) throw new BadRequestException('That person does not sign letters for this legal entity.');
    if (!s) return null;
    const u = await tx.user.findFirstOrThrow({ where: { organizationId: org, id: s.userId }, select: { name: true, email: true } });
    return { row: s, name: u.name || u.email, title: s.title };
  }

  private async prepare(tx: Tx, c: CompanyContext, v: Viewer | null, dto: { letterType: string; personId: string; signatoryId?: string | null }) {
    const base = await letterData(tx, c, dto.personId).catch(() => {
      throw new BadRequestException('This person has no job or joiner record.');
    });
    const t = await this.activeTemplate(tx, c.organizationId, dto.letterType, base.legalEntityId);
    // Null: the system issues it (exit letters, LIFE-4.03; a person's own certificate, LIFE-4.06).
    if (v) await this.mayIssue(tx, c, v, dto.personId, t.fields);
    const signer = await this.signatoryFor(tx, c.organizationId, base.legalEntityId, dto.signatoryId);
    const { data } = await letterData(tx, c, dto.personId, { signatory: signer ? { name: signer.name, title: signer.title } : null });
    const missing = missingFields(t.fields, data);
    if (missing.length) throw new BadRequestException({ statusCode: 400, code: 'LETTER_FIELDS_MISSING', message: `This letter cannot be made yet. Missing: ${missing.map((m) => FIELDS[m].label.toLowerCase()).join(', ')}${missing.some((m) => m.startsWith('signatory')) ? ' (name a signatory for the legal entity in Settings › Letter templates)' : ''}.`, errors: Object.fromEntries(missing.map((m) => [m, FIELDS[m].label])) });
    return { t, data, signer, legalEntityId: base.legalEntityId };
  }

  /** The issuer's preview with real data (never numbered). */
  async previewLetter(ctx: TenantContext, user: ScopeUser, dto: { letterType: string; personId: string; signatoryId?: string | null }) {
    const v = await this.viewer(user);
    const p = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.prepare(tx, c, v, dto);
      return { ...r, docx: await this.fileBytes(tx, c.organizationId, r.t.fileId) };
    });
    return { file: await previewMark(await this.toPdf(fillDocx(p.docx, p.data))), name: 'preview.pdf', contentType: 'application/pdf' };
  }

  async issue(ctx: TenantContext, user: ScopeUser, dto: IssueInput) {
    return this.issueAs(ctx, await this.viewer(user), dto);
  }

  /** Issued by the system for an event (exit letters) or a person's own instant certificate: no issuer checks. */
  issueSystem(ctx: TenantContext, dto: IssueInput) {
    return this.issueAs({ ...ctx, userId: ctx.userId ?? null }, null, dto);
  }

  private async issueAs(ctx: TenantContext, v: Viewer | null, dto: IssueInput) {
    let notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { t, data, signer, legalEntityId } = await this.prepare(tx, c, v, dto);
      if (dto.supersedesId) {
        const old = await tx.letterIssue.findFirst({ where: { organizationId: org, id: dto.supersedesId } });
        if (!old || old.status !== 'issued' || old.personId !== dto.personId || old.letterType !== dto.letterType) throw new BadRequestException('Only an issued letter of the same type for the same person can be corrected.');
      }
      if (await tx.letterIssue.findFirst({ where: { organizationId: org, personId: dto.personId, letterType: t.letterType, status: { in: ['pending_approval', 'rendering', 'awaiting_signature'] } }, select: { id: true } })) throw new ConflictException('A letter of this type for this person is already on its way.');
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: dto.personId } });
      const title = `${t.name}: ${[p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ')}`.slice(0, 150);
      const l = await tx.letterIssue.create({
        data: {
          organizationId: org,
          templateId: t.id,
          templateVersion: t.version,
          letterType: t.letterType,
          title,
          personId: dto.personId,
          legalEntityId,
          subjectType: dto.subjectType ?? null,
          subjectId: dto.subjectId ?? null,
          dataEnc: this.seal(data),
          status: t.requiresApproval ? 'pending_approval' : 'rendering',
          supersedesId: dto.supersedesId ?? null,
          signatoryId: signer?.row.id ?? null,
          personSigns: t.personSigns,
          requestedBy: c.userId ?? null,
        },
      });
      if (t.requiresApproval) {
        const approver = signer && signer.row.userId !== c.userId ? [signer.row.userId] : [];
        const fallback = (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active', id: { not: c.userId ?? undefined } }, select: { id: true }, take: 25 })).map((u) => u.id);
        const sub = await this.approvals.submit(tx, c, {
          type: REQUEST_TYPE,
          subjectType: 'letter_issue',
          subjectId: l.id,
          title: `${t.name} to approve`,
          summary: [
            { label: 'Letter', value: t.name },
            { label: 'For', value: title.split(': ').slice(1).join(': ') },
          ],
          subjectPersonId: dto.personId,
          requesterUserId: c.userId ?? null,
          raisedByUserId: c.userId ?? null,
          steps: [{ name: 'Signatory', approvers: approver.length ? [{ kind: 'users', userIds: approver }] : [], mode: 'any' }],
          payload: {},
          payloadFields: [],
          fallbackUserIds: fallback,
        });
        notices = sub.notices;
        await tx.letterIssue.update({ where: { id: l.id }, data: { wfRequestId: sub.id } });
      }
      await audit(tx, c, 'letter.requested', 'letter_issue', l.id, { letterType: t.letterType, templateVersion: t.version, personId: dto.personId, approval: t.requiresApproval, supersedes: dto.supersedesId ?? null });
      return { l, org };
    });
    if (notices.length) await this.approvals.send(ctx, notices);
    if (res.l.status === 'rendering') await this.render(res.org, res.l.id);
    return this.letterView(await this.tenantPrisma.forTenant({ organizationId: res.org, isSuperAdmin: false }, (tx) => tx.letterIssue.findFirstOrThrow({ where: { id: res.l.id } })));
  }

  /** Number → fill → PDF → stamp → (DSC) → issued. Safe to run twice; failures stay "rendering" for the retry. */
  async render(org: string, id: string): Promise<boolean> {
    const ctx = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    // 1. The reference number and verify code, taken once (gap-free: a number is never reused).
    const l = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`letter-render:${id}`}))`;
      const row = await tx.letterIssue.findFirst({ where: { organizationId: org, id } });
      if (!row || row.status !== 'rendering') return null;
      if (row.referenceNo) return row;
      const year = Number(todayIst().slice(0, 4));
      const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
        INSERT INTO letter_counters (organization_id, legal_entity_id, letter_type, year, next) VALUES (${org}::uuid, ${row.legalEntityId}::uuid, ${row.letterType}, ${year}, 2)
        ON CONFLICT (organization_id, legal_entity_id, letter_type, year) DO UPDATE SET next = letter_counters.next + 1
        RETURNING next - 1 AS next`;
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: row.legalEntityId }, select: { shortName: true } });
      return tx.letterIssue.update({ where: { id }, data: { referenceNo: referenceNo(entity.shortName.toUpperCase(), typeCode(row.letterType), year, Number(next)), verifyCode: verifyCode() } });
    });
    if (!l) return false;
    try {
      const { docx, signatory } = await this.tenantPrisma.forTenant(ctx, async (tx) => {
        const t = await tx.letterTemplate.findFirstOrThrow({ where: { organizationId: org, id: l.templateId } });
        const s = l.signatoryId ? await tx.signatory.findFirst({ where: { organizationId: org, id: l.signatoryId } }) : null;
        const image = s?.signatureFileId ? await this.fileBytes(tx, org, s.signatureFileId).catch(() => null) : null;
        return { docx: await this.fileBytes(tx, org, t.fileId), signatory: s ? { image } : null };
      });
      const data = this.open(l.dataEnc);
      const filled = fillDocx(docx, data);
      let pdf = await stampPdf(await this.toPdf(filled), { referenceNo: l.referenceNo!, verifyCode: l.verifyCode!, verifyUrl: verifyLink(l.verifyCode!), signatory: signatory ? { name: String(data.signatory_name ?? ''), title: String(data.signatory_title ?? ''), image: signatory.image } : null });
      const template = await this.tenantPrisma.forTenant(ctx, (tx) => tx.letterTemplate.findFirstOrThrow({ where: { organizationId: org, id: l.templateId }, select: { companyDsc: true } }));
      let signatureRef: string | null = null;
      let awaiting = false;
      if (template.companyDsc) {
        const signed = await this.signer.sign(pdf, { organizationId: org, legalEntityId: l.legalEntityId, referenceNo: l.referenceNo! });
        if (signed) {
          pdf = signed.pdf;
          signatureRef = signed.ref;
        } else awaiting = true;
      }
      // 2. Stored and issued (or waiting for the company's token signature), with the letter task closed.
      await this.tenantPrisma.forTenant(ctx, async (tx) => {
        const file = await this.files.storeIn(tx, ctx, { area: 'letters', name: `${l.referenceNo!.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`, data: pdf, allowedMime: ['application/pdf'], maxMb: 20, via: 'system' });
        await tx.file.update({ where: { id: file.id }, data: { scanStatus: 'clean', scanDetail: 'generated by YukthiX', scannedAt: new Date() } });
        if (awaiting) {
          await tx.letterIssue.update({ where: { id }, data: { status: 'awaiting_signature', fileId: file.id, unsignedSha256: sha256(pdf), unsignedBytes: pdf.length, renderError: null } });
          await audit(tx, ctx, 'letter.awaiting_signature', 'letter_issue', id, { referenceNo: l.referenceNo });
          return;
        }
        await this.issuedIn(tx, ctx, l, file.id, sha256(pdf), signatureRef);
      });
      if (!awaiting) await this.afterIssue(ctx, id);
      return true;
    } catch (e) {
      this.logger.warn(`Letter ${id} not rendered yet: ${(e as Error).message}`);
      await this.tenantPrisma.forTenant(ctx, (tx) => tx.letterIssue.updateMany({ where: { organizationId: org, id, status: 'rendering' }, data: { renderError: (e as Error).message.slice(0, 300) } }));
      return false;
    }
  }

  private async issuedIn(tx: Tx, c: CompanyContext, l: Letter, fileId: string, hash: string, signatureRef: string | null) {
    const org = c.organizationId;
    const n = await tx.letterIssue.updateMany({ where: { organizationId: org, id: l.id, status: { in: ['rendering', 'awaiting_signature'] } }, data: { status: 'issued', fileId, sha256: hash, signatureRef, issuedBy: l.requestedBy, issuedAt: new Date(), renderError: null } });
    if (!n.count) throw new ConflictException('This letter was issued meanwhile.');
    if (l.supersedesId) await tx.letterIssue.update({ where: { id: l.supersedesId }, data: { status: 'superseded', supersededById: l.id } });
    if (l.personSigns) await tx.signatureRequest.create({ data: { organizationId: org, letterIssueId: l.id, personId: l.personId, status: 'open' } });
    await audit(tx, c, 'letter.issued', 'letter_issue', l.id, { referenceNo: l.referenceNo, sha256: hash, letterType: l.letterType, supersedes: l.supersedesId, dsc: Boolean(signatureRef) });
    // The checklist's letter task closes from the issued letter (YX-LC-26), and other modules hear of it.
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'document.issued', payload: { letterIssueId: l.id, personId: l.personId, letterType: l.letterType, referenceNo: l.referenceNo } } });
  }

  private async afterIssue(ctx: CompanyContext, id: string) {
    const users = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const l = await tx.letterIssue.findFirstOrThrow({ where: { organizationId: ctx.organizationId, id } });
      const emp = await tx.employee.findFirst({ where: { organizationId: ctx.organizationId, personId: l.personId, userId: { not: null } }, select: { userId: true } });
      return emp?.userId ? [emp.userId] : [];
    });
    if (users.length) await this.notifications.notifySystem(ctx, users, 'letter.ready', { entityType: 'letter_issue', entityId: id, contextText: 'A letter for you is ready in YukthiX', linkPath: '/yx/me/letters' }, { subject: 'A letter for you is ready', html: '<p>A letter for you is ready. Open YukthiX to read it.</p>' }).catch(() => undefined);
  }

  /** The company's token-signed PDF (payroll's check: valid signature, CCA chain, not revoked, exactly our bytes). */
  async attachSignature(ctx: TenantContext, user: ScopeUser, id: string, file: Buffer | undefined) {
    const v = await this.viewer(user);
    this.requireKey(v, 'letter.issue');
    if (!file?.length) throw new BadRequestException('Attach the signed PDF.');
    const l = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.letterIssue.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!row || row.status !== 'awaiting_signature' || !row.unsignedSha256 || !row.unsignedBytes) throw new ConflictException('This letter is not waiting for a signature.');
      return row;
    });
    let signer;
    try {
      signer = await verifySignedPdf(file, { sha256: l.unsignedSha256!, bytes: l.unsignedBytes! }, this.roots, this.revocation);
    } catch (e) {
      if (!(e instanceof SignatureRefused)) throw e;
      await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'letter.signature_refused', 'letter_issue', l.id, { reason: e.message, uploadSha256: sha256(file) }));
      throw new BadRequestException({ statusCode: 400, code: 'SIGNATURE_REFUSED', message: e.message });
    }
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const stored = await this.files.storeIn(tx, c, { area: 'letters', name: `${l.referenceNo!.replace(/[^A-Za-z0-9]+/g, '-')}-signed.pdf`, data: file, allowedMime: ['application/pdf'], maxMb: 20, via: 'staff' });
      await tx.file.update({ where: { id: stored.id }, data: { scanStatus: 'clean', scanDetail: 'signature verified', scannedAt: new Date() } });
      await this.issuedIn(tx, c, l, stored.id, sha256(file), `${signer.issuer} #${signer.serial}`.slice(0, 200));
    });
    await this.afterIssue(ctx as CompanyContext, l.id);
    return { id: l.id, status: 'issued', signer: signer.subject };
  }

  /** Hourly: letters still "being prepared" (the PDF service was down) are tried again. */
  async retryRendering(): Promise<number> {
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.letterIssue.findMany({ where: { status: 'rendering', createdAt: { lt: new Date(Date.now() - 60_000) } }, select: { id: true, organizationId: true }, take: 100 }));
    let n = 0;
    for (const r of rows) if (await this.render(r.organizationId, r.id)) n++;
    return n;
  }

  // ------------------------------------------------------------------------------------------ reading

  letterView(l: Letter, extra: { person?: string; signature?: { status: string; signedAt: string | null } | null } = {}) {
    return {
      id: l.id,
      title: l.title,
      letterType: l.letterType,
      personId: l.personId,
      person: extra.person,
      referenceNo: l.referenceNo,
      verifyCode: l.status === 'issued' || l.status === 'superseded' ? l.verifyCode : null,
      status: l.status,
      renderError: l.status === 'rendering' ? l.renderError : null,
      issuedAt: l.issuedAt?.toISOString() ?? null,
      personSigns: l.personSigns,
      acceptedAt: l.acceptedAt?.toISOString() ?? null,
      signature: extra.signature ?? null,
      supersededById: l.supersededById,
    };
  }

  /** HR's register: letters to people the viewer may issue to (optionally one person). */
  async register(ctx: TenantContext, user: ScopeUser, personId?: string) {
    const v = await this.viewer(user);
    this.requireKey(v, 'letter.issue');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      const rows = await tx.letterIssue.findMany({ where: { organizationId: c.organizationId, ...(personId ? { personId } : {}) }, orderBy: { createdAt: 'desc' }, take: 300 });
      const out = [];
      const seen = new Map<string, boolean>();
      for (const r of rows) {
        if (!seen.has(r.personId)) seen.set(r.personId, own.personId !== r.personId && (await reachesPerson(tx, c, v, 'letter.issue', r.personId, own)));
        if (!seen.get(r.personId)) continue;
        const p = await tx.person.findFirstOrThrow({ where: { organizationId: c.organizationId, id: r.personId } });
        const sr = await tx.signatureRequest.findFirst({ where: { organizationId: c.organizationId, letterIssueId: r.id } });
        out.push(this.letterView(r, { person: [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' '), signature: sr ? { status: sr.status, signedAt: sr.signedAt?.toISOString() ?? null } : null }));
      }
      return out;
    });
  }

  /** My letters (issued to me), with what is waiting for my acceptance. */
  /** PPL-31 (P05 Q8): an employee's own certificate, issued at once (the company switches the template on). */
  async myCertificate(ctx: TenantContext, user: ScopeUser, letterType: string) {
    if (!SELF_CERTIFICATES.includes(letterType)) throw new BadRequestException('That certificate is not available here.');
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Only the employee asks for their own certificate.');
    const personId = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      const open = own.employeeId ? await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId: own.employeeId, exitedOn: null }, select: { id: true } }) : null;
      if (!own.personId || !open) throw new ForbiddenException('Certificates are for current employees.');
      return own.personId;
    });
    return this.issueSystem(ctx, { letterType, personId });
  }

  async mine(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      if (!own.personId) return { letters: [], esignAccepted: false };
      return this.lettersOf(tx, c.organizationId, own.personId);
    });
  }

  async lettersOf(tx: Tx, org: string, personId: string) {
    const rows = await tx.letterIssue.findMany({ where: { organizationId: org, personId, status: { in: ['issued', 'superseded'] } }, orderBy: { issuedAt: 'desc' } });
    const srs = await tx.signatureRequest.findMany({ where: { organizationId: org, personId, letterIssueId: { in: rows.map((r) => r.id) } } });
    const consent = await tx.consentRecord.findFirst({ where: { organizationId: org, personId, purpose: 'esign', withdrawnAt: null }, select: { id: true } });
    return {
      letters: rows.map((r) => {
        const sr = srs.find((s) => s.letterIssueId === r.id);
        return this.letterView(r, { signature: sr ? { status: sr.status, signedAt: sr.signedAt?.toISOString() ?? null } : null });
      }),
      esignAccepted: Boolean(consent),
    };
  }

  /** The issued PDF (or the acceptance copy) for the person or HR in scope. */
  async file(ctx: TenantContext, user: ScopeUser, id: string, which: 'letter' | 'acceptance') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const l = await tx.letterIssue.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!l) throw new NotFoundException('No such letter.');
      const own = await ownOf(tx, c, v);
      const self = own.personId === l.personId;
      if (!self && !(await reachesPerson(tx, c, v, 'letter.issue', l.personId, own))) throw new ForbiddenException('You cannot see this letter.');
      if (self && !['issued', 'superseded'].includes(l.status)) throw new NotFoundException('No such letter.');
      return this.letterFile(tx, c, l, which, self ? 'self' : 'hr');
    });
  }

  async letterFile(tx: Tx, c: CompanyContext, l: Letter, which: 'letter' | 'acceptance', by: string) {
    const fileId = which === 'acceptance' ? l.acceptanceFileId : l.fileId;
    if (!fileId) throw new NotFoundException(which === 'acceptance' ? 'Not accepted yet.' : 'Not issued yet.');
    if (by !== 'self') await audit(tx, c, 'letter.viewed', 'letter_issue', l.id, { which, by });
    return { file: await this.fileBytes(tx, c.organizationId, fileId), name: `${(l.referenceNo ?? 'letter').replace(/[^A-Za-z0-9]+/g, '-')}${which === 'acceptance' ? '-accepted' : ''}.pdf`, contentType: 'application/pdf' };
  }

  // ------------------------------------------------------------------------------------------ e-sign (LIFE-2.07)

  private otpKey = (org: string, letterId: string, personId: string) => `letter-sign:${org}:${letterId}:${personId}`;

  /** Step 1 for an employee in the app: a one-time code to their email. */
  async signCode(ctx: TenantContext, user: ScopeUser, id: string, ip: string | null) {
    const v = await this.viewer(user);
    const { email, personId, org } = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      const l = await tx.letterIssue.findFirst({ where: { organizationId: c.organizationId, id, personId: own.personId ?? undefined } });
      if (!own.personId || !l) throw new NotFoundException('No such letter.');
      const u = await tx.user.findFirstOrThrow({ where: { organizationId: c.organizationId, id: v.userId! }, select: { email: true } });
      return { email: u.email, personId: own.personId, org: c.organizationId };
    });
    return this.sendCode(org, id, personId, email, ip);
  }

  async sendCode(org: string, letterId: string, personId: string, email: string, ip: string | null) {
    await this.otp.reserveSend(`letter-sign:${org}:${personId}`, ip);
    const code = await this.otp.issue(this.otpKey(org, letterId, personId), { email });
    this.otp.deliver('email', email, code, 'mfa', org, { userId: '' });
    return { sent: true, to: email.replace(/^(.).*(@.*)$/, '$1•••$2') };
  }

  async sign(ctx: TenantContext, user: ScopeUser, id: string, dto: { code: string; accept: boolean; disclosureAccepted?: boolean }, meta: { ip: string | null; device: string | null; assurance: string }) {
    const v = await this.viewer(user);
    const { org, personId, who } = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      if (!own.personId) throw new NotFoundException('No such letter.');
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: c.organizationId, id: own.personId } });
      return { org: c.organizationId, personId: own.personId, who: [p.givenName, p.familyName].filter(Boolean).join(' ') };
    });
    return this.signAs(org, personId, id, dto, { ...meta, channel: 'email', who });
  }

  /** Steps 2 for anyone (employee or pre-boarder, already authenticated): the code, "I accept", the sealed copy. */
  async signAs(org: string, personId: string, id: string, dto: { code: string; accept: boolean; disclosureAccepted?: boolean }, ev: SignEvidence) {
    if (!dto.accept) throw new BadRequestException('Tick "I accept" to accept the letter.');
    const ctx = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    const l = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const row = await tx.letterIssue.findFirst({ where: { organizationId: org, id, personId } });
      const sr = row ? await tx.signatureRequest.findFirst({ where: { organizationId: org, letterIssueId: id, personId, status: 'open' } }) : null;
      if (!row || row.status !== 'issued' || !sr) throw new ConflictException('This letter is not waiting for your acceptance.');
      const consent = await tx.consentRecord.findFirst({ where: { organizationId: org, personId, purpose: 'esign', withdrawnAt: null } });
      if (!consent && !dto.disclosureAccepted) throw new BadRequestException({ statusCode: 400, code: 'ESIGN_DISCLOSURE', message: 'Read and accept how electronic acceptance works first.' });
      return row;
    });
    const data = await this.otp.check(this.otpKey(org, id, personId), dto.code);
    if (!data) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
    const at = new Date();
    const pdf = await this.tenantPrisma.forTenant(ctx, (tx) => this.fileBytes(tx, org, l.fileId!));
    const copy = await acceptanceCopy(pdf, { title: l.title, referenceNo: l.referenceNo!, letterSha256: l.sha256!, who: ev.who, at: at.toISOString(), channel: ev.channel === 'email' ? 'email' : 'text message', ip: ev.ip, device: ev.device, assurance: ev.assurance });
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      if (!(await tx.consentRecord.findFirst({ where: { organizationId: org, personId, purpose: 'esign', withdrawnAt: null } }))) {
        await tx.consentRecord.create({ data: { organizationId: org, personId, purpose: 'esign', noticeVersion: ESIGN_NOTICE, itemsShown: ['Electronic records', 'One-time code acceptance', 'Your copy'], evidence: { ip: ev.ip, device: ev.device, at: at.toISOString() } } });
      }
      const file = await this.files.storeIn(tx, ctx, { area: 'letters', name: `${l.referenceNo!.replace(/[^A-Za-z0-9]+/g, '-')}-accepted.pdf`, data: copy, allowedMime: ['application/pdf'], maxMb: 25, via: 'system' });
      await tx.file.update({ where: { id: file.id }, data: { scanStatus: 'clean', scanDetail: 'generated by YukthiX', scannedAt: new Date() } });
      const evidence = { at: at.toISOString(), ip: ev.ip, device: ev.device, channel: ev.channel, assurance: ev.assurance, letterSha256: l.sha256, copySha256: sha256(copy) };
      const n = await tx.signatureRequest.updateMany({ where: { organizationId: org, letterIssueId: id, personId, status: 'open' }, data: { status: 'signed', evidence, signedAt: at } });
      if (!n.count) throw new ConflictException('This letter was accepted meanwhile.');
      await tx.letterIssue.update({ where: { id }, data: { acceptedAt: at, acceptanceFileId: file.id } });
      await audit(tx, ctx, 'letter.accepted', 'letter_issue', id, evidence);
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'signature.completed', payload: { letterIssueId: id, personId } } });
    });
    if (l.requestedBy) await this.notifications.notifySystem(ctx, [l.requestedBy], 'letter.signed', { entityType: 'letter_issue', entityId: id, contextText: `${l.title} was accepted`, linkPath: '/yx/people/letters' }, { subject: 'A letter was accepted', html: '<p>A letter you issued was accepted in YukthiX.</p>' }).catch(() => undefined);
    return { accepted: true, acceptedAt: at.toISOString() };
  }

  // ------------------------------------------------------------------------------------------ public check (LIFE-2.06)

  /** For payroll's public verify page: company, letter, name, date, current / superseded; nothing else. */
  async verify(code: string) {
    if (!VERIFY_CODE.test(code)) return null;
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const l = await tx.letterIssue.findFirst({ where: { verifyCode: code, status: { in: ['issued', 'superseded'] } }, select: { organizationId: true, personId: true, letterType: true, templateId: true, issuedAt: true, status: true } });
      if (!l) return null;
      const [org, p, t] = await Promise.all([
        tx.organization.findUnique({ where: { id: l.organizationId }, select: { name: true } }),
        tx.person.findFirst({ where: { organizationId: l.organizationId, id: l.personId }, select: { givenName: true, familyName: true, preferredName: true } }),
        tx.letterTemplate.findFirst({ where: { organizationId: l.organizationId, id: l.templateId }, select: { name: true } }),
      ]);
      return { company: org?.name ?? '', kind: t?.name ?? 'Letter', name: p ? [p.preferredName ?? p.givenName, p.familyName].filter(Boolean).join(' ') : '', issuedOn: l.issuedAt!.toISOString().slice(0, 10), status: (l.status === 'issued' ? 'current' : 'superseded') as 'current' | 'superseded' };
    });
  }
}
