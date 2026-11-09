import { InternalApplicationsService } from '../internal-applications/internal-applications.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, has, type ScopeUser, type Viewer } from '../access/scope';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { holdersOf } from '../time/time-core';
import { ApprovalsEngine, type Notice, type StepSpec } from '../workflow/approvals-engine.service';
import { resolveSteps, type ChainStepInput } from '../approvals/approver-resolver';
import { ApprovalsService } from '../approvals/approvals.service';
import { EmailService } from '../email/email.service';
import { EmailLookService } from '../email/email-look.service';
import { offerReminderEmail } from '../email/account-emails';
import { NotificationsService } from '../notifications/notifications.service';
import { formatIstDate } from './offer-rules';
import { PayStructuresService } from '../payroll/structures.service';
import { breakupJson, inCtcOf } from '../payroll/structure';
import { DEFAULT_OFFER_TEMPLATE } from './default-offer-template';
import { BAND_TEXT, REVISABLE, bandAddsStep, bandPosition, compensationText, conditionNames, inr, offerLines, revisionNeedsApproval, statusAfterRevision, type BandPosition, type OfferLine } from './offer-rules';
import type { OfferConditionDto, OfferCreateDto, OfferDraftDto, OfferPayDto, OfferPreviewDto, OfferReviseDto } from './dto/offer-builder.dto';

// HIR-09 offer builder and HIR-29 conditions (founder decisions 4 and 5, 9 Nov 2026).
//   pay        CTC lines from the company's salary structure, worked out by Pay's own breakup for the work location
//              (PayStructuresService.offerBreakupIn: the same maths as an employee's salary); variable and the joining
//              bonus (with its clawback) are added lines. Offer pay is sensitive: only holders of
//              ats.offer.compensation.view see or set amounts; others see the offer without pay.
//   versions   each change is a new version (history kept); an older free-text offer reads as version 0 from its text
//   approval   the company's offer chain (approval_chains 'offer', resolved to people now) runs on the P03 engine as
//              'ats.offer'; an offer ABOVE the grade range adds one step whose approver is the company setting
//              hiring.offer.band_approver (default the HR head). The person who sends it for approval never approves.
//              No chain and no extra step: approved at once (the older auto-pass)
//   letter     the company's offer template; e-sign only when the template switches it on (copied at send); accepting by
//              the link stays the default
//   conditions open until met or waived with a reason; the company's starting list is a setting (one a line)
// Every write is refused while acting for someone else (the controller), audited without amounts.

export const OFFER_TYPE = 'ats.offer';
const PAY_KEY = 'ats.offer.compensation.view';
const NONE = '00000000-0000-0000-0000-000000000000';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Founder answer 336: a reminder of one kind goes at most once a day per offer (the recruiter's button, never automatic). */
const REMIND_GAP_MS = 20 * 3_600_000;

type OfferRow = Prisma.OfferGetPayload<{ include: { pipelineEntry: { include: { candidate: true; job: true } } } }>;

const ACTIVITY: Record<string, (m: Record<string, unknown>) => string> = {
  'offer.created': () => 'created the offer',
  'ats.offer.created': () => 'created offer version 1',
  'ats.offer.revised': (m) => `revised the offer to version ${m.version}${m.needsApproval ? ' (needs approval again)' : ''}`,
  'ats.offer.submitted': () => 'sent the offer for approval',
  'ats.offer.auto_approved': () => 'sent the offer; no approval was needed',
  'ats.offer.approved': () => 'offer approved',
  'ats.offer.turned_down': () => 'offer turned down by an approver; back to draft',
  'offer.sent': () => 'sent the offer to the candidate',
  'offer.send_failed': () => 'the offer email could not be sent',
  'offer.accepted': (m) => (m.esign ? 'the candidate signed and accepted the offer' : 'the candidate accepted the offer by the link'),
  'offer.declined': () => 'the candidate declined the offer',
  'offer.withdrawn': () => 'withdrew the offer',
  'ats.offer.pay_handed_off': (m) => `the joiner's first salary went to Pay from version ${m.version}, for approval`,
  'ats.offer.pay_handoff_failed': (m) => `the offer pay did not go to Pay: ${m.reason}`,
  'ats.offer.joining_bonus_queued': (m) => `the joining bonus goes to Pay as one-time pay in ${m.month}`,
  'ats.offer.joining_bonus_failed': (m) => `the joining bonus did not go to Pay: ${m.reason}`,
  'ats.offer.reminder_sent': (m) => (m.kind === 'documents' ? `reminded the candidate about what is still due` : 'reminded the candidate to answer the offer'),
  'ats.offer.joining_day_notice': (m) => `told HR on the joining day: ${m.open} condition${m.open === 1 ? '' : 's'} still open`,
  'ats.offer.condition.added': (m) => `added the condition "${m.name}"`,
  'ats.offer.condition.met': (m) => `marked "${m.name}" met`,
  'ats.offer.condition.waived': (m) => `waived "${m.name}": ${m.reason}`,
};

@Injectable()
export class OfferBuilderService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly structures: PayStructuresService,
    private readonly approvals: ApprovalsService,
    private readonly email: EmailService,
    private readonly looks: EmailLookService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly internal?: InternalApplicationsService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: OFFER_TYPE, label: 'Offer', risk: 'normal', autoActions: false, distinctSteps: true, onDecided: (tx, req, o) => this.decided(tx, req, o), requesterLink: (r) => `/yx/hiring/offers/${r.subjectId}` });
  }

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [PAY_KEY]);
  }

  /** Offer pay is shown only to holders of ats.offer.compensation.view (lists, the letter, the record). */
  async canSeePay(user: ScopeUser) {
    return has(await this.viewer(user), PAY_KEY);
  }

  private needPay(v: Viewer) {
    if (!has(v, PAY_KEY)) throw new ForbiddenException('Offer pay needs ats.offer.compensation.view. Ask HR to set the pay.');
  }

  // ------------------------------------------------------------------------------------------ reads

  async entry(tx: Tx, org: string, entryId: string) {
    const e = await tx.pipelineEntry.findFirst({ where: { organizationId: org, id: entryId }, include: { candidate: true, job: true } });
    if (!e || e.job.deletedAt) throw new NotFoundException('No such application.');
    return e;
  }

  private async load(tx: Tx, org: string, offerId: string): Promise<OfferRow> {
    const o = await tx.offer.findFirst({ where: { organizationId: org, id: offerId }, include: { pipelineEntry: { include: { candidate: true, job: true } } } });
    if (!o) throw new NotFoundException('No such offer.');
    return o;
  }

  /** The grade's pay range for the job's legal entity on a day (founder rule R1: read here, shown only with the pay key). */
  async band(tx: Tx, org: string, gradeId: string | null, legalEntityId: string | null, on: string) {
    if (!gradeId || !legalEntityId) return null;
    const day = new Date(`${on}T00:00:00Z`);
    const r = await tx.gradePayRange.findFirst({ where: { organizationId: org, gradeId, legalEntityId, validFrom: { lte: day }, OR: [{ validTo: null }, { validTo: { gte: day } }] }, orderBy: { validFrom: 'desc' } });
    return r ? { min: r.min, max: r.max } : null;
  }

  /** Salary structures the job's legal entity can use on a day: the latest version of each active template. */
  async structuresFor(tx: Tx, org: string, legalEntityId: string | null, on: string) {
    const ts = await tx.salaryTemplate.findMany({ where: { organizationId: org, status: 'active', OR: [{ legalEntityId: null }, ...(legalEntityId ? [{ legalEntityId }] : [])] }, orderBy: { name: 'asc' } });
    const out: { value: string; label: string }[] = [];
    for (const t of ts) {
      const ver = await tx.salaryTemplateVersion.findFirst({ where: { organizationId: org, templateId: t.id, validFrom: { lte: new Date(`${on}T00:00:00Z`) } }, orderBy: { validFrom: 'desc' } });
      if (ver) out.push({ value: ver.id, label: t.name });
    }
    return out;
  }

  /** Works out the pay: Pay's breakup for the candidate, the offer's lines, the band check. */
  private async work(tx: Tx, org: string, job: { gradeId: string | null; legalEntityId: string | null }, dto: OfferPayDto, on: string) {
    const loc = await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId }, select: { legalEntityId: true, archivedAt: true } });
    if (!loc || loc.archivedAt || (job.legalEntityId && loc.legalEntityId !== job.legalEntityId)) throw new BadRequestException('Choose a work location of the job’s legal entity.');
    const ver = await tx.salaryTemplateVersion.findFirst({ where: { organizationId: org, id: dto.templateVersionId }, select: { validFrom: true } });
    if (!ver) throw new BadRequestException('Choose one of the company’s salary structures.');
    if (iso(ver.validFrom) > on) throw new BadRequestException('That salary structure starts after the joining day. Choose another one.');
    const { b, warnings, components, options } = await this.structures.offerBreakupIn(tx, org, { templateVersionId: dto.templateVersionId, legalEntityId: job.legalEntityId, locationId: dto.locationId, on, annualCtc: dto.annualCtc });
    const band = await this.band(tx, org, job.gradeId, job.legalEntityId, on);
    const position = bandPosition(dto.annualCtc, band);
    const variablePay = dto.variablePay ?? '0';
    const joiningBonus = dto.joiningBonus ?? '0';
    if (D(joiningBonus).gt(0) && !dto.clawbackMonths) throw new BadRequestException('Give the clawback months for the joining bonus.');
    // Only what is inside the CTC, so the lines add up to it (a gratuity provision outside the CTC is left out).
    const inside = new Set(components.filter((x) => inCtcOf(x, options)).map((x) => x.code));
    const lines = offerLines(breakupJson(b).lines.filter((l) => inside.has(l.code)), variablePay, joiningBonus);
    return { lines, monthlyGross: b.monthlyGross, band, position, warnings, variablePay, joiningBonus, clawbackMonths: D(joiningBonus).gt(0) ? (dto.clawbackMonths ?? null) : null };
  }

  private checkDates(dto: OfferDraftDto) {
    const today = todayIst();
    if (dto.startDate < today) throw new BadRequestException('The joining day cannot be in the past.');
    if (dto.expiresAt.slice(0, 10) < today) throw new BadRequestException('The offer cannot expire in the past.');
    if (dto.expiresAt.slice(0, 10) > dto.startDate) throw new BadRequestException('The offer must expire on or before the joining day.');
  }

  /** The builder's facts for one application: candidate, job, grade and range, structures, places, letters, the route. */
  async setup(ctx: TenantContext, user: ScopeUser, entryId: string) {
    const v = await this.viewer(user);
    this.needPay(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await this.entry(tx, org, entryId);
      const today = todayIst();
      const grade = e.job.gradeId ? await tx.grade.findFirst({ where: { organizationId: org, id: e.job.gradeId }, select: { name: true, code: true } }) : null;
      const band = await this.band(tx, org, e.job.gradeId, e.job.legalEntityId, today);
      const locations = await tx.location.findMany({ where: { organizationId: org, archivedAt: null, ...(e.job.legalEntityId ? { legalEntityId: e.job.legalEntityId } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 });
      const letters = await tx.offerTemplate.findMany({ where: { organizationId: org }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
      const conditions = conditionNames(await settingFor(tx, c, 'hiring.offer.default_conditions', { legalEntityId: e.job.legalEntityId ?? '' }));
      const org$ = await tx.organization.findUnique({ where: { id: org }, select: { name: true } });
      return {
        entryId: e.id,
        candidate: { id: e.candidateId, name: e.candidate.name },
        job: { id: e.jobId, title: e.job.title, locationId: e.job.locationId },
        company: org$?.name ?? '',
        grade: grade ? { id: e.job.gradeId, name: grade.code || grade.name } : null,
        band: band ? { min: Number(band.min), max: Number(band.max) } : null,
        structures: await this.structuresFor(tx, org, e.job.legalEntityId, today),
        locations: locations.map((l) => ({ value: l.id, label: l.name })),
        letters: letters.length ? letters.map((t) => ({ value: t.id, label: t.name, esign: t.esign, subject: t.subject, body: t.body })) : [{ value: 'default', label: 'Default offer letter', esign: false, ...DEFAULT_OFFER_TEMPLATE }],
        defaultConditions: conditions,
        // Offers answer 404: the builder's default expiry (days after today), the same setting bulk offers use.
        expiryDays: Number(await settingFor(tx, c, 'hiring.offer.expiry_days', { legalEntityId: e.job.legalEntityId ?? '' })),
        route: await this.routePreview(tx, c, e.job, user.userId ?? null),
      };
    });
  }

  /** Careers answer 355: the applicant's own answer to the pay-history question (rupees a year), pay-key holders only. */
  async currentPay(ctx: TenantContext, user: ScopeUser, entryId: string) {
    this.needPay(await this.viewer(user));
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.entry(tx, c.organizationId, entryId);
      return { currentPay: e.currentPay };
    });
  }

  /** Breakup preview; nothing is kept. */
  async preview(ctx: TenantContext, user: ScopeUser, dto: OfferPreviewDto & { on?: string }) {
    const v = await this.viewer(user);
    this.needPay(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.entry(tx, c.organizationId, dto.entryId);
      const w = await this.work(tx, c.organizationId, e.job, dto, dto.on && /^\d{4}-\d{2}-\d{2}$/.test(dto.on) ? dto.on : todayIst());
      return { lines: w.lines, monthlyGross: Number(w.monthlyGross), band: w.band ? { min: Number(w.band.min), max: Number(w.band.max) } : null, bandPosition: w.position, bandText: BAND_TEXT[w.position], extraApproval: bandAddsStep(w.position), warnings: w.warnings };
    });
  }

  // ------------------------------------------------------------------------------------------ the route

  /** Users who approve the band step: the company setting (founder decision 4); never the sender. */
  private async bandApprovers(tx: Tx, c: CompanyContext, job: { hiringManagerId: string | null; legalEntityId: string | null }, not: string | null) {
    const who = await settingFor(tx, c, 'hiring.offer.band_approver', { legalEntityId: job.legalEntityId ?? '' });
    const org = c.organizationId;
    let ids: string[] = [];
    let label = who === 'hiring_manager' ? 'Above the pay range (hiring manager)' : 'Above the pay range (HR head)';
    if (who === 'hiring_manager') ids = job.hiringManagerId ? [job.hiringManagerId] : [];
    else if (UUID_RE.test(who)) {
      // Answer 332: a named person who holds the offer-pay key (approving pay they may not see is refused at save).
      const u = await tx.user.findFirst({ where: { organizationId: org, id: who, status: 'active' }, select: { id: true, name: true, email: true } });
      const holds = u ? (await holdersOf(tx, org, PAY_KEY, NONE, todayIst())).includes(u.id) : false;
      ids = u && holds ? [u.id] : [];
      if (u) label = `Above the pay range (${u.name || u.email})`;
    } else {
      const hr = await tx.department.findFirst({ where: { organizationId: org, code: 'HR', archivedAt: null, headEmployeeId: { not: null } }, select: { headEmployeeId: true } });
      const head = hr ? await tx.employee.findFirst({ where: { organizationId: org, id: hr.headEmployeeId! }, select: { userId: true } }) : null;
      ids = head?.userId ? [head.userId] : await holdersOf(tx, org, PAY_KEY, NONE, todayIst());
    }
    return { label, ids: ids.filter((u) => u !== not).slice(0, 25) };
  }

  private async chainSteps(tx: Tx, org: string, offerId: string | null, sender: string | null): Promise<StepSpec[]> {
    const chain = await tx.approvalChain.findFirst({ where: { organizationId: org, gate: 'offer', enabled: true }, include: { steps: { orderBy: { position: 'asc' } } } });
    const input: ChainStepInput[] = (chain?.steps ?? []).map((s) => ({ position: s.position, name: s.name, approverType: s.approverType as ChainStepInput['approverType'], approverUserIds: s.approverUserIds ? (JSON.parse(s.approverUserIds) as string[]) : [], managerLevel: s.managerLevel, groupId: s.groupId }));
    const { resolved } = await resolveSteps(tx, { steps: input, submitterUserId: sender ?? NONE, gate: 'offer', subjectId: offerId ?? NONE, organizationId: org });
    return resolved.map((r) => ({ name: r.name, approvers: [{ kind: 'users', userIds: r.approverUserIds.filter((u) => u !== sender) }], mode: 'any', selfApproval: 'never' }));
  }

  /** The route the builder shows before sending: the chain's steps and, when above the range, the extra step. */
  async routePreview(tx: Tx, c: CompanyContext, job: { hiringManagerId: string | null; legalEntityId: string | null }, sender: string | null) {
    const steps = await this.chainSteps(tx, c.organizationId, null, sender);
    const band = await this.bandApprovers(tx, c, job, sender);
    const ids = [...new Set([...steps.flatMap((s) => (s.approvers[0] as { userIds: string[] }).userIds), ...band.ids])];
    const users = ids.length ? await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: ids } }, select: { id: true, name: true } }) : [];
    const name = (list: string[]) => list.map((u) => users.find((x) => x.id === u)?.name ?? 'Someone').slice(0, 3);
    return {
      steps: steps.map((s) => ({ name: s.name, approvers: name((s.approvers[0] as { userIds: string[] }).userIds) })),
      bandStep: { name: band.label, approvers: name(band.ids) },
    };
  }

  // ------------------------------------------------------------------------------------------ create and revise

  private async letterOf(tx: Tx, org: string, templateId: string | undefined) {
    if (!templateId) {
      const d = await tx.offerTemplate.findFirst({ where: { organizationId: org, isDefault: true } });
      return d ? { id: d.id, subject: d.subject, body: d.body } : { id: null, ...DEFAULT_OFFER_TEMPLATE };
    }
    const t = await tx.offerTemplate.findFirst({ where: { organizationId: org, id: templateId } });
    if (!t) throw new BadRequestException('Choose one of the company’s offer letters.');
    return { id: t.id, subject: t.subject, body: t.body };
  }

  private versionData(org: string, offerId: string, version: number, dto: OfferDraftDto, gradeId: string | null, w: Awaited<ReturnType<OfferBuilderService['work']>>, needsApproval: boolean, by: string | null, note: string | null): Prisma.OfferVersionUncheckedCreateInput {
    return {
      organizationId: org, offerId, version, annualCtc: dto.annualCtc, variablePay: w.variablePay, joiningBonus: w.joiningBonus, clawbackMonths: w.clawbackMonths,
      salaryTemplateVersionId: dto.templateVersionId, gradeId, bandMin: w.band?.min ?? null, bandMax: w.band?.max ?? null, bandPosition: w.position,
      lines: w.lines as unknown as Prisma.InputJsonValue, monthlyGross: w.monthlyGross, startDate: new Date(dto.startDate), expiresAt: new Date(dto.expiresAt),
      locationId: dto.locationId, letterKind: dto.letterKind ?? 'offer', note, needsApproval, createdBy: by,
    };
  }

  async create(ctx: TenantContext, user: ScopeUser, dto: OfferCreateDto, opts: { batchId?: string } = {}) {
    const made = await this.createOffer(ctx, user, dto, opts);
    // HIR-13: an internal applicant's manager may be told at the offer (company setting).
    await this.internal?.tellAtOffer(ctx, dto.entryId);
    return made;
  }

  private async createOffer(ctx: TenantContext, user: ScopeUser, dto: OfferCreateDto, opts: { batchId?: string } = {}) {
    const v = await this.viewer(user);
    this.needPay(v);
    this.checkDates(dto);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await this.entry(tx, org, dto.entryId);
      if (e.candidate.erasedAt) throw new BadRequestException('This candidate’s details were erased.');
      if (await tx.offer.findFirst({ where: { organizationId: org, pipelineEntryId: e.id, status: { in: ['draft', 'pending_approval', 'approved', 'sent', 'accepted'] } }, select: { id: true } })) throw new ConflictException('This application already has an open offer. Revise that offer instead.');
      const w = await this.work(tx, org, e.job, dto, dto.startDate);
      const letter = await this.letterOf(tx, org, dto.templateId);
      const pay = { annualCtc: dto.annualCtc, variablePay: w.variablePay, joiningBonus: w.joiningBonus, clawbackMonths: w.clawbackMonths };
      const offer = await tx.offer.create({
        data: { organizationId: org, pipelineEntryId: e.id, candidateId: e.candidateId, compensation: compensationText(pay), startDate: new Date(dto.startDate), expiresAt: new Date(dto.expiresAt), status: 'draft', letterSubject: letter.subject, letterBody: letter.body, templateId: letter.id, gradeId: e.job.gradeId, currentVersion: 1, createdBy: c.userId ?? null, batchId: opts.batchId ?? null },
      });
      await tx.offerVersion.create({ data: this.versionData(org, offer.id, 1, dto, e.job.gradeId, w, true, c.userId ?? null, null) });
      if (dto.addConditions) {
        const names = conditionNames(await settingFor(tx, c, 'hiring.offer.default_conditions', { legalEntityId: e.job.legalEntityId ?? '' }));
        if (names.length) await tx.offerCondition.createMany({ data: names.map((name) => ({ organizationId: org, offerId: offer.id, name, dueOn: new Date(`${dto.startDate}T00:00:00Z`), createdBy: c.userId ?? null })) });
      }
      // No amounts in the audit log (pay is Confidential).
      await audit(tx, c, 'ats.offer.created', 'offer', offer.id, { version: 1, band: w.position, conditions: Boolean(dto.addConditions) });
      return { id: offer.id, version: 1, bandPosition: w.position, extraApproval: bandAddsStep(w.position) };
    });
  }

  async revise(ctx: TenantContext, user: ScopeUser, offerId: string, dto: OfferReviseDto) {
    const v = await this.viewer(user);
    this.needPay(v);
    this.checkDates(dto);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`offer:${offerId}`}))`;
      const o = await this.load(tx, org, offerId);
      if (!(REVISABLE as readonly string[]).includes(o.status)) throw new ConflictException(`A ${o.status.replace('_', ' ')} offer cannot be revised. Make a new offer if needed.`);
      if (o.currentVersion !== dto.fromVersion) throw new ConflictException('Someone else changed this offer meanwhile. Reload it and try again.');
      const prev = o.currentVersion ? await tx.offerVersion.findFirst({ where: { organizationId: org, offerId, version: o.currentVersion } }) : null;
      const w = await this.work(tx, org, o.pipelineEntry.job, dto, dto.startDate);
      const gradeId = o.gradeId ?? o.pipelineEntry.job.gradeId;
      const needsApproval = revisionNeedsApproval(prev ? { annualCtc: prev.annualCtc, gradeId: prev.gradeId } : null, { annualCtc: dto.annualCtc, gradeId });
      // A request still waiting is closed: the new version goes through the route again if it needs to.
      if (o.wfRequestId && o.status === 'pending_approval') await this.engine.withdraw(tx, c, o.wfRequestId, c.userId ?? null, 'A new version of the offer replaced it');
      const status = statusAfterRevision(o.status, needsApproval);
      const letterWithdrawn = o.status === 'sent';
      const letter = dto.templateId && dto.templateId !== o.templateId ? await this.letterOf(tx, org, dto.templateId) : null;
      const version = o.currentVersion + 1;
      const pay = { annualCtc: dto.annualCtc, variablePay: w.variablePay, joiningBonus: w.joiningBonus, clawbackMonths: w.clawbackMonths };
      const n = await tx.offer.updateMany({
        where: { organizationId: org, id: offerId, currentVersion: dto.fromVersion },
        data: {
          currentVersion: version, status, compensation: compensationText(pay), startDate: new Date(dto.startDate), expiresAt: new Date(dto.expiresAt), gradeId,
          // The earlier letter can no longer be accepted (its link stops working).
          ...(letterWithdrawn ? { offerToken: null, pdfPath: null } : {}),
          ...(letter ? { templateId: letter.id, letterSubject: letter.subject, letterBody: letter.body } : {}),
          ...(status === 'draft' ? { wfRequestId: null } : {}),
        },
      });
      if (!n.count) throw new ConflictException('Someone else changed this offer meanwhile. Reload it and try again.');
      await tx.offerVersion.create({ data: { ...this.versionData(org, offerId, version, dto, gradeId, w, needsApproval, c.userId ?? null, dto.note ?? null), replacedText: o.currentVersion === 0 ? o.compensation : null } });
      await audit(tx, c, 'ats.offer.revised', 'offer', offerId, { version, needsApproval, letterWithdrawn, band: w.position });
      return { id: offerId, version, status, needsApproval, letterWithdrawn, bandPosition: w.position, extraApproval: bandAddsStep(w.position) };
    });
  }

  // ------------------------------------------------------------------------------------------ approval

  /** Sends a draft offer through its route (P03 'ats.offer'). The sender is never one of its approvers. */
  async submit(ctx: TenantContext, userId: string, offerId: string): Promise<{ status: 'approved' | 'pending_approval'; requestId?: string }> {
    let notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`offer:${offerId}`}))`;
      const o = await this.load(tx, org, offerId);
      if (o.status !== 'draft') throw new ConflictException('Only a draft offer can be sent for approval.');
      if (o.pipelineEntry.candidate.erasedAt) throw new BadRequestException('This candidate’s details were erased.');
      const cur = o.currentVersion ? await tx.offerVersion.findFirst({ where: { organizationId: org, offerId, version: o.currentVersion } }) : null;
      const steps = await this.chainSteps(tx, org, offerId, userId);
      const position = (cur?.bandPosition ?? 'none') as BandPosition;
      if (bandAddsStep(position)) {
        const b = await this.bandApprovers(tx, c, o.pipelineEntry.job, userId);
        steps.push({ name: b.label, approvers: [{ kind: 'users', userIds: b.ids }], mode: 'any', selfApproval: 'never' });
      }
      if (!steps.length) {
        await tx.offer.update({ where: { id: offerId }, data: { status: 'approved' } });
        await audit(tx, c, 'ats.offer.auto_approved', 'offer', offerId, { version: o.currentVersion });
        return { status: 'approved' as const };
      }
      const admins = (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id).filter((u) => u !== userId);
      const sub = await this.engine.submit(tx, c, {
        type: OFFER_TYPE,
        subjectType: 'offer',
        subjectId: offerId,
        title: `Offer: ${o.pipelineEntry.candidate.name}, ${o.pipelineEntry.job.title}`,
        // Approvers decide on pay, so the fixed CTC and the range check go with the request (the inbox only; cards stay neutral).
        summary: [
          { label: 'Version', value: String(o.currentVersion || 0) },
          ...(cur ? [{ label: 'Fixed CTC', value: inr(cur.annualCtc) }, { label: 'Pay range', value: BAND_TEXT[position] }] : [{ label: 'Pay', value: o.compensation.slice(0, 200) }]),
          { label: 'Joining', value: iso(o.startDate) },
        ],
        subjectPersonId: null,
        requesterUserId: userId,
        raisedByUserId: userId,
        steps,
        payload: {},
        payloadFields: [],
        fallbackUserIds: admins,
        fallbackWording: { who: 'the company admins', check: 'Check who approves offers' },
      });
      notices = sub.notices;
      await tx.offer.update({ where: { id: offerId }, data: { status: 'pending_approval', wfRequestId: sub.id } });
      await audit(tx, c, 'ats.offer.submitted', 'offer', offerId, { version: o.currentVersion, band: position, steps: steps.length });
      return { status: 'pending_approval' as const, requestId: sub.id };
    });
    if (notices.length) await this.engine.send(ctx, notices);
    return out;
  }

  /** Withdraws the offer's waiting request: back to draft. False when it has no P03 request (an older one). */
  async cancelApproval(ctx: TenantContext, userId: string, offerId: string): Promise<boolean> {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const o = await tx.offer.findFirst({ where: { organizationId: c.organizationId, id: offerId } });
      if (!o) throw new NotFoundException('No such offer.');
      if (!o.wfRequestId) return false;
      const req = await tx.wfRequest.findFirst({ where: { organizationId: c.organizationId, id: o.wfRequestId } });
      if (!req || req.status !== 'pending') return false;
      if (req.requesterUserId !== userId && !(await this.approvals.isConfigurer(ctx, userId))) throw new ForbiddenException('Only the person who sent it for approval, or an approvals admin, withdraws it.');
      await this.engine.withdraw(tx, c, req.id, userId, 'Withdrawn to change the offer');
      await tx.offer.update({ where: { id: offerId }, data: { status: 'draft', wfRequestId: null } });
      return true;
    });
  }

  private async decided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const o = await tx.offer.findFirst({ where: { organizationId: req.organizationId, wfRequestId: req.id } });
    if (!o || o.status !== 'pending_approval') return;
    await tx.offer.update({ where: { id: o.id }, data: { status: outcome === 'approved' ? 'approved' : 'draft' } });
    await AuditService.recordIn(tx, { organizationId: req.organizationId, isSuperAdmin: false }, { actorUserId: null, action: outcome === 'approved' ? 'ats.offer.approved' : 'ats.offer.turned_down', entityType: 'offer', entityId: o.id, metadata: { requestId: req.id } });
  }

  // ------------------------------------------------------------------------------------------ the record

  async record(ctx: TenantContext, user: ScopeUser, offerId: string) {
    const v = await this.viewer(user);
    const pay = has(v, PAY_KEY);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const o = await this.load(tx, org, offerId);
      const versions = await tx.offerVersion.findMany({ where: { organizationId: org, offerId }, orderBy: { version: 'desc' } });
      const people = [...new Set([...versions.map((x) => x.createdBy), o.sentByUserId].filter((x): x is string => Boolean(x)))];
      const users = people.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: people } }, select: { id: true, name: true } }) : [];
      const who = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? null) : null);
      const cur = versions.find((x) => x.version === o.currentVersion) ?? null;
      const grade = (o.gradeId ?? o.pipelineEntry.job.gradeId) ? await tx.grade.findFirst({ where: { organizationId: org, id: (o.gradeId ?? o.pipelineEntry.job.gradeId)! }, select: { name: true, code: true } }) : null;
      const location = cur?.locationId ? await tx.location.findFirst({ where: { organizationId: org, id: cur.locationId }, select: { name: true } }) : null;
      const req = o.wfRequestId ? await tx.wfRequest.findFirst({ where: { organizationId: org, id: o.wfRequestId } }) : null;
      const route = req ? await this.engine.viewIn(tx, org, req) : null;
      const myTask = req && user.userId ? await tx.wfTask.findFirst({ where: { organizationId: org, requestId: req.id, assigneeUserId: user.userId, status: 'open', step: req.currentStep }, select: { id: true } }) : null;
      const conditions = await tx.offerCondition.findMany({ where: { organizationId: org, offerId }, orderBy: [{ dueOn: 'asc' }, { createdAt: 'asc' }] });
      const logs = await tx.auditLog.findMany({ where: { organizationId: org, entityType: 'offer', entityId: offerId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, actorName: true, createdAt: true, metadataJson: true } });
      const joiner = await tx.preboarding.findFirst({ where: { organizationId: org, offerId, status: { not: 'cancelled' } }, select: { id: true, status: true } });
      const meta = (s: string | null) => {
        try {
          return s ? (JSON.parse(s) as Record<string, unknown>) : {};
        } catch {
          return {};
        }
      };
      const money = (x: Prisma.Decimal | null) => (pay && x !== null ? Number(x) : null);
      return {
        id: o.id,
        status: o.status,
        entryId: o.pipelineEntryId,
        candidate: { id: o.candidateId, name: o.pipelineEntry.candidate.name },
        job: { id: o.pipelineEntry.jobId, title: o.pipelineEntry.job.title },
        grade: grade ? grade.code || grade.name : null,
        location: location?.name ?? null,
        currentVersion: o.currentVersion,
        startDate: iso(o.startDate),
        expiresAt: o.expiresAt.toISOString(),
        esign: o.esign,
        templateId: o.templateId,
        canSeePay: pay,
        sentBy: who(o.sentByUserId),
        sentAt: o.sentAt,
        respondedAt: o.respondedAt,
        current: cur
          ? {
              version: cur.version,
              letterKind: cur.letterKind,
              templateVersionId: cur.salaryTemplateVersionId,
              locationId: cur.locationId,
              bandPosition: cur.bandPosition,
              bandText: BAND_TEXT[cur.bandPosition as BandPosition],
              extraApproval: bandAddsStep(cur.bandPosition as BandPosition),
              ...(pay
                ? { annualCtc: Number(cur.annualCtc), variablePay: Number(cur.variablePay), joiningBonus: Number(cur.joiningBonus), clawbackMonths: cur.clawbackMonths, monthlyGross: Number(cur.monthlyGross), band: cur.bandMin && cur.bandMax ? { min: Number(cur.bandMin), max: Number(cur.bandMax) } : null, lines: cur.lines as unknown as OfferLine[] }
                : {}),
            }
          : null,
        versions: [
          ...versions.map((x) => ({ version: x.version, current: x.version === o.currentVersion, at: x.createdAt, by: who(x.createdBy), note: x.note, needsApproval: x.needsApproval, annualCtc: money(x.annualCtc), bandPosition: x.bandPosition })),
          // Founder decision 5: an older free-text offer stays readable as version 0 (its text is pay: shown with the key only).
          ...(o.currentVersion === 0 || versions.some((x) => x.replacedText !== null)
            ? [{ version: 0, current: o.currentVersion === 0, at: o.createdAt, by: null, note: 'Offer made before CTC lines (text only)', needsApproval: false, annualCtc: null, bandPosition: 'none', text: pay ? (o.currentVersion === 0 ? o.compensation : (versions.find((x) => x.replacedText !== null)?.replacedText ?? null)) : null }]
            : []),
        ],
        conditions: conditions.map((x) => ({ id: x.id, name: x.name, dueOn: iso(x.dueOn), status: x.status, reason: x.reason, decidedAt: x.decidedAt })),
        approval: route ? { requestId: route.id, status: route.status, steps: route.steps.map((s) => ({ name: s.name, state: s.state, approvers: [...new Set([...s.approvers.map((a) => a.name), ...s.waitingFor])].filter(Boolean) })), myTaskId: myTask?.id ?? null } : null,
        activity: logs.map((l) => ({ id: l.id, actor: l.actorName ?? (l.action.startsWith('offer.accepted') || l.action === 'offer.declined' ? o.pipelineEntry.candidate.name : 'YukthiX'), action: (ACTIVITY[l.action] ?? (() => l.action))(meta(l.metadataJson)), at: l.createdAt })),
        joiner,
      };
    });
  }

  // ------------------------------------------------------------------------------------------ reminders (answer 336)

  /**
   * The recruiter's Send reminder: a sent offer not answered yet (the offer reminder), or an accepted or sent offer with
   * conditions still open (the documents reminder). The company's own email templates; never sent automatically; logged.
   */
  async remind(ctx: TenantContext, offerId: string) {
    const prep = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const o = await this.load(tx, org, offerId);
      const open = await tx.offerCondition.findMany({ where: { organizationId: org, offerId, status: 'open' }, orderBy: { dueOn: 'asc' }, select: { name: true } });
      const kind: 'offer' | 'documents' | null = o.status === 'sent' && o.expiresAt > new Date() ? 'offer' : (o.status === 'accepted' || o.status === 'sent') && open.length ? 'documents' : null;
      if (!kind) throw new ConflictException(o.status === 'sent' ? 'This offer has expired: there is nothing to remind about. Revise it to send a new one.' : 'There is nothing to remind the candidate about: the offer is not waiting for an answer and no condition is open.');
      if (o.pipelineEntry.candidate.erasedAt) throw new BadRequestException('This candidate’s details were erased.');
      if (!o.offerToken) throw new ConflictException('This offer has no live link. Send it again first.');
      const last = await tx.auditLog.findFirst({ where: { organizationId: org, entityType: 'offer', entityId: offerId, action: 'ats.offer.reminder_sent', createdAt: { gt: new Date(Date.now() - REMIND_GAP_MS) } }, select: { metadataJson: true } });
      if (last && last.metadataJson?.includes(`"kind":"${kind}"`)) throw new ConflictException('A reminder already went in the last day. Try again tomorrow.');
      const company = (await tx.organization.findUnique({ where: { id: org }, select: { name: true } }))?.name ?? null;
      return { kind, o, due: open.map((x) => x.name), company, org };
    });
    const to = prep.o.pipelineEntry.candidate.email;
    const link = `${(process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/yx/offer/${prep.o.offerToken}`;
    const look = await this.looks.forCompany(prep.org, prep.kind === 'offer' ? 'offer_reminder' : 'offer_documents_reminder');
    const mail = await offerReminderEmail({ to, company: prep.company, firstName: prep.o.pipelineEntry.candidate.name.split(/\s+/)[0] ?? null, look, kind: prep.kind, link, jobTitle: prep.o.pipelineEntry.job.title, answerBy: formatIstDate(prep.o.expiresAt), due: prep.due });
    const sent = await this.email.send({ to, ...mail, organizationId: prep.org });
    if (!sent.success) throw new ConflictException('The reminder could not be sent. Try again in a few minutes.');
    await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'ats.offer.reminder_sent', 'offer', offerId, { kind: prep.kind, items: prep.due.length }));
    return { sent: true, kind: prep.kind };
  }

  // ------------------------------------------------------------------------------------------ joining day (answer 335)

  /**
   * Hourly: on an accepted offer's joining day (IST), HR is told once which conditions are still open. HR decides; nothing
   * lapses or is withdrawn by itself. HR = the joiner's HR owner in People, else whoever made and sent the offer.
   */
  async joiningDaySweep(now = new Date()) {
    const today = todayIst(now);
    const from = new Date(`${today}T00:00:00+05:30`);
    const to = new Date(from.getTime() + 86_400_000);
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.offer.findMany({ where: { status: 'accepted', conditionsNoticeAt: null, startDate: { gte: from, lt: to }, conditions: { some: { status: 'open' } } }, select: { id: true, organizationId: true }, take: 500 }),
    );
    let told = 0;
    for (const d of due) {
      const ctx = { organizationId: d.organizationId, isSuperAdmin: false };
      try {
        const n = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
          const claimed = await tx.offer.updateMany({ where: { organizationId: c.organizationId, id: d.id, conditionsNoticeAt: null }, data: { conditionsNoticeAt: now } });
          if (!claimed.count) return null;
          const o = await this.load(tx, c.organizationId, d.id);
          const open = await tx.offerCondition.findMany({ where: { organizationId: c.organizationId, offerId: d.id, status: 'open' }, orderBy: { dueOn: 'asc' }, select: { name: true } });
          const pb = await tx.preboarding.findFirst({ where: { organizationId: c.organizationId, offerId: d.id, status: { not: 'cancelled' } }, select: { hrOwnerUserId: true } });
          await AuditService.recordIn(tx, c, { actorUserId: null, action: 'ats.offer.joining_day_notice', entityType: 'offer', entityId: d.id, metadata: { open: open.length } });
          return { to: [pb?.hrOwnerUserId ?? null, o.createdBy, o.sentByUserId].filter((x): x is string => Boolean(x)), name: o.pipelineEntry.candidate.name, open: open.map((x) => x.name) };
        });
        if (!n || !n.to.length) continue;
        const text = `${n.name} joins today with ${n.open.length} offer condition${n.open.length === 1 ? '' : 's'} still open: ${n.open.join(', ')}. Mark each met or waive it with a reason.`;
        await this.notifications
          .notifySystem(ctx, [...new Set(n.to)], 'ats.offer.conditions_open', { entityType: 'offer', entityId: d.id, contextText: text.slice(0, 300), linkPath: `/yx/hiring/offers/${d.id}` }, { subject: `${n.name} joins today: offer conditions still open`, html: `<p>${text.replace(/[<>&]/g, '')}</p>` })
          .catch(() => undefined);
        told++;
      } catch {
        // One company's problem never stops the others; the offer is tried again next hour only if the claim rolled back.
      }
    }
    return told;
  }

  // ------------------------------------------------------------------------------------------ conditions (HIR-29)

  private async openOffer(tx: Tx, org: string, offerId: string) {
    const o = await tx.offer.findFirst({ where: { organizationId: org, id: offerId }, select: { id: true, status: true } });
    if (!o) throw new NotFoundException('No such offer.');
    if (['withdrawn', 'declined'].includes(o.status)) throw new ConflictException(`This offer was ${o.status}. Its conditions no longer change.`);
    return o;
  }

  async addCondition(ctx: TenantContext, offerId: string, dto: OfferConditionDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.openOffer(tx, c.organizationId, offerId);
      if ((await tx.offerCondition.count({ where: { organizationId: c.organizationId, offerId } })) >= 30) throw new BadRequestException('An offer has at most 30 conditions.');
      if (dto.dueOn < todayIst()) throw new BadRequestException('The due day cannot be in the past.');
      const row = await tx.offerCondition.create({ data: { organizationId: c.organizationId, offerId, name: dto.name, dueOn: new Date(`${dto.dueOn}T00:00:00Z`), createdBy: c.userId ?? null } });
      await audit(tx, c, 'ats.offer.condition.added', 'offer', offerId, { conditionId: row.id, name: row.name });
      return { id: row.id };
    });
  }

  async decideCondition(ctx: TenantContext, offerId: string, conditionId: string, to: 'met' | 'waived', reason: string | null) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.openOffer(tx, c.organizationId, offerId);
      const row = await tx.offerCondition.findFirst({ where: { organizationId: c.organizationId, offerId, id: conditionId } });
      if (!row) throw new NotFoundException('No such condition.');
      const n = await tx.offerCondition.updateMany({ where: { id: conditionId, status: 'open' }, data: { status: to, reason, decidedBy: c.userId ?? null, decidedAt: new Date() } });
      if (!n.count) throw new ConflictException(`This condition is already ${row.status}.`);
      await audit(tx, c, `ats.offer.condition.${to}`, 'offer', offerId, { conditionId, name: row.name, ...(reason ? { reason } : {}) });
      return { id: conditionId, status: to };
    });
  }
}
