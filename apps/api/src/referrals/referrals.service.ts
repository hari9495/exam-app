import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenantContext, TenantPrismaService, AuditService, BlobStorageService, PrismaService } from '@exam-platform/shared';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { JobsService } from '../jobs/jobs.service';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';
import { validatePdfUpload } from '../public-applications/pdf-validation';
import { SubmitReferralDto, SetRewardStatusDto } from './dto/referral.dto';
import { inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { PayrollIntakeService } from '../payroll/intake.service';
import { withPayScope } from '../payroll/pay-access';
import { AutomationService } from '../rules-engine/automation.service';
import { quarterIst } from '../hiring/careers-admin.service';

export interface ReferralRow {
  id: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  status: string;
  rewardStatus: string;
  rewardNote: string | null;
  note: string | null;
  referrerName?: string;
  createdAt: Date;
  /** HIR-12: Applied (still in the first stage), In process, Hired or Not selected (rejected or archived). */
  stage: 'Applied' | 'In process' | 'Hired' | 'Not selected';
  /** Start date of the accepted offer (YYYY-MM-DD), the day the qualifying days count from. */
  joinedOn: string | null;
  /** The bonus promised, whole rupees (0 when the reward was turned down or they left before the qualifying day). */
  bonusInr: number;
  /** Joining day + the qualifying days (YYYY-MM-DD), when hired. */
  eligibleOn: string | null;
  /** Last working day of an accepted exit, if any (People). */
  leftOn: string | null;
  /**
   * not-hired, waiting, due, paid, left (exited before the qualifying day), none (not selected or turned down), on-hold
   * (answer 234: their resignation waits for approval; only an accepted exit cancels the bonus).
   */
  bonusDue: 'not-hired' | 'waiting' | 'due' | 'paid' | 'left' | 'none' | 'on-hold';
  /** Answer 285: a paid bonus went through payroll, or was paid outside payroll (null while not paid). */
  paidVia: 'payroll' | 'outside' | null;
  /** HR's list only: the referrer has an employee record, so payroll can pay them. */
  referrerIsEmployee?: boolean;
}

/** HIR-12 company policy: the bonus and the days a referred hire must complete (settings with defaults). */
export interface ReferralPolicy {
  bonusInr: number;
  qualifyDays: number;
  /** No credit when the person applied for the job on their own within these days (0 = always credit). */
  selfApplyDays: number;
}

/** Ways a person comes in on their own (careers apply, re-apply), as opposed to being added by the company. */
const SELF_APPLIED = ['application', 'reapply'];
/** "1 Dec 2026" from YYYY-MM-DD (the product's date format). */
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

@Injectable()
export class ReferralsService implements OnModuleInit {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
    private readonly jobsService: JobsService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly intake: PayrollIntakeService,
    private readonly automation: AutomationService,
  ) {}

  /** Answer 231: the bonus cost follows its payroll line, posted when the run that pays it is approved. */
  onModuleInit() {
    this.automation.subscribe(async (ev) => {
      if (ev.type === 'payroll.run.approved' && typeof ev.payload.runId === 'string') await this.postPaidCosts(ev.organizationId, ev.payload.runId);
    });
  }

  /** The referral bonus lines on an approved run's payslips become Referral bonus costs (once each, by referral). */
  async postPaidCosts(organizationId: string, runId: string) {
    const c = { organizationId, isSuperAdmin: false };
    const posted = await this.tenantPrisma.forTenant(c, async (tx) => {
      const entities = (await tx.legalEntity.findMany({ where: { organizationId }, select: { id: true } })).map((e) => e.id);
      return withPayScope(tx, entities, async () => {
        const run = await tx.payrollRun.findFirst({ where: { organizationId, id: runId, status: { in: ['approved', 'paid'] } }, select: { periodStart: true } });
        if (!run) return [];
        const slips = (await tx.payslip.findMany({ where: { organizationId, runId, status: { in: ['approved', 'paid'] } }, select: { id: true } })).map((s) => s.id);
        const refs = (await tx.payslipLine.findMany({ where: { organizationId, payslipId: { in: slips }, componentCode: 'referral_bonus', sourceRef: { not: null } }, select: { sourceRef: true } })).map((l) => l.sourceRef!);
        const lines = refs.length ? await tx.oneTimePay.findMany({ where: { organizationId, id: { in: refs }, source: 'm10', status: 'approved' } }) : [];
        const out: string[] = [];
        for (const l of lines) {
          const referral = await tx.referral.findFirst({ where: { organizationId, id: (l.sourceRef ?? '').replace(/^referral:/, '') } });
          if (!referral) continue;
          const name = (await tx.candidate.findFirst({ where: { organizationId, id: referral.candidateId }, select: { name: true } }))?.name ?? 'referral';
          const made = await tx.recruitingCost.createMany({
            data: [{ organizationId, origin: 'payroll', sourceRef: l.sourceRef, jobId: referral.jobId, source: `Referral: ${name}`.slice(0, 120), costType: 'referral_bonus', amount: l.amount, currency: 'INR', period: run.periodStart, note: 'Referral bonus paid in payroll', enteredBy: l.createdBy }],
            skipDuplicates: true,
          });
          if (made.count) out.push(referral.id);
        }
        return out;
      });
    });
    for (const id of posted) await this.audit.record(c, { actorUserId: null as unknown as string, action: 'referral.bonus_cost_posted', entityType: 'referral', entityId: id, metadata: { runId } });
    return posted;
  }

  /**
   * HIR-12 All referrals: the older recruiter key (`legacy`) works as before; ats.referral.manage counts only when held for
   * the whole company (the HR Admin template is typically per legal entity; referrals are company-wide, fail closed).
   */
  async managerGate(user: ScopeUser, legacy: 'candidate:view' | 'pipeline:manage') {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['ats.referral.manage', legacy]);
    if (!tenantWide(v, 'ats.referral.manage') && !v.grants.has(legacy)) throw new ForbiddenException('All referrals is company-wide: this needs the referrals key for the whole company, not one legal entity.');
  }

  async policy(context: TenantContext): Promise<ReferralPolicy> {
    return inCompany(this.tenantPrisma, context, (tx, c) => readPolicy(tx, c));
  }

  // Open jobs a staffer can refer someone to (link-only roles included -- referral is internal, so
  // publicApplyEnabled/listOnCareers are not required, unlike the public careers list).
  async referableJobs(context: TenantContext) {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.job.findMany({
        where: { status: 'open' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, location: true, department: true },
      }),
    );
  }

  async submit(context: TenantContext, referrerUserId: string, dto: SubmitReferralDto) {
    const orgId = context.organizationId as string;

    // Decode + validate the résumé (if any) BEFORE the tx; upload runs outside the tx (blob call).
    let resumePath: string | null = null;
    if (dto.resumeBase64) {
      const buf = Buffer.from(dto.resumeBase64, 'base64');
      validatePdfUpload(buf); // throws BadRequest on non-PDF / oversized
      resumePath = await this.blobStorage.upload(`candidates/${orgId}/${randomUUID()}.pdf`, buf, 'application/pdf');
    }

    const { referral, candidateId, isNew } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: dto.jobId }, select: { id: true, status: true, pipelineId: true } });
      if (!job) throw new NotFoundException('Job not found');
      if (job.status !== 'open') throw new BadRequestException('That job is not open for referrals');

      // Candidate upsert (org+email). Anti-tamper: never overwrite an existing candidate's name/phone.
      const existing = await tx.candidate.findUnique({ where: { organizationId_email: { organizationId: orgId, email: dto.email } } });
      const candidate = await tx.candidate.upsert({
        where: { organizationId_email: { organizationId: orgId, email: dto.email } },
        create: { organizationId: orgId, email: dto.email, name: dto.name, phone: dto.phone ?? null, portalToken: randomUUID() },
        update: { deletedAt: null, deletedByUserId: null }, // resurrect a soft-deleted row; keep stored name/phone
      });

      if (resumePath) {
        await tx.candidateProfile.upsert({
          where: { candidateId: candidate.id },
          create: { organizationId: orgId, candidateId: candidate.id, resumePath, parseStatus: 'pending' },
          update: { resumePath, parseStatus: 'pending', parsedSummary: null, parsedSkills: null, parsedTitle: null, parsedYearsExperience: null, parsedAt: null },
        });
      }

      // First active-category stage's first status (same rule as apply()/addEntry).
      const pipeline = job.pipelineId
        ? await tx.pipeline.findFirst({ where: { id: job.pipelineId }, include: { stages: { orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } } } })
        : null;
      const activeStage = pipeline?.stages.find((s: { category: string }) => s.category === 'active') ?? pipeline?.stages[0];
      const statusId = activeStage?.statuses[0]?.id;

      // Reuse the existing entry if the person is already in this job's pipeline; else create one
      // tagged as a referral. Stamp referrerUserId onto an un-attributed existing entry so a prior
      // public application still credits the referrer.
      const existingEntry = await tx.pipelineEntry.findUnique({ where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } } });
      const policy = await readPolicy(tx, { ...context, organizationId: orgId });
      // Founder answer 201: someone who applied for this job on their own within the set days is not credited.
      if (existingEntry && !existingEntry.referrerUserId && SELF_APPLIED.includes(existingEntry.enteredVia) && policy.selfApplyDays > 0 && existingEntry.createdAt.getTime() > Date.now() - policy.selfApplyDays * 86_400_000) {
        throw new ConflictException(`This person applied for this job on their own in the last ${policy.selfApplyDays} days, so the referral can't be credited`);
      }
      let entry;
      if (existingEntry) {
        entry = existingEntry;
        if (!existingEntry.referrerUserId) {
          entry = await tx.pipelineEntry.update({ where: { id: existingEntry.id }, data: { referrerUserId } });
        }
      } else {
        entry = await tx.pipelineEntry.create({
          data: { organizationId: orgId, jobId: job.id, candidateId: candidate.id, enteredVia: 'referral', applicationToken: randomUUID(), statusId, referrerUserId },
        });
      }

      // One referral per entry. A duplicate submit for the same person+job is a conflict.
      const existingReferral = await tx.referral.findUnique({ where: { entryId: entry.id } });
      if (existingReferral) throw new ConflictException('This person has already been referred for this role');

      const referral = await tx.referral.create({
        data: { organizationId: orgId, referrerUserId, jobId: job.id, candidateId: candidate.id, entryId: entry.id, note: dto.note ?? null, bonusInr: policy.bonusInr },
      });
      await recomputeGlobalStage(tx, orgId, candidate.id);
      return { referral, candidateId: candidate.id, isNew: !existing };
    });

    // Parse the résumé for search/autofill (best-effort, inert until AI keyed), like apply().
    if (resumePath) {
      await this.jobsService.enqueue(context, 'resume_parse', JSON.stringify({ candidateId }), referrerUserId).catch((e) => this.logger.warn(`resume_parse enqueue failed: ${e instanceof Error ? e.message : e}`));
    }
    await this.audit.record(context, { actorUserId: referrerUserId, action: 'referral.submitted', entityType: 'referral', entityId: referral.id, metadata: { jobId: dto.jobId, isNewCandidate: isNew, consentGiven: dto.consentGiven === true } });
    return { id: referral.id };
  }

  async myReferrals(context: TenantContext, referrerUserId: string): Promise<ReferralRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const referrals = await tx.referral.findMany({ where: { referrerUserId }, orderBy: { createdAt: 'desc' } });
      return this.buildRows(tx, referrals, false);
    });
  }

  async listAll(context: TenantContext): Promise<ReferralRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const referrals = await tx.referral.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
      return this.buildRows(tx, referrals, true);
    });
  }

  /**
   * Reward status (recruiter or HR). HIR-12 founder answers 203-205, 231, 234: "paid" is only for a bonus that is due
   * (hired, the qualifying days done, not left before, no resignation waiting for approval). It hands payroll a one-time
   * Referral bonus line for the person who referred (PayrollIntakeService, linked to the referral), in the first open pay
   * month; the Recruiting cost is posted when the run that pays it is approved (postPaidCosts). Moving away from "paid"
   * cancels the line while no approved run has it, and is refused after. Both are audited.
   */
  async setReward(context: TenantContext, actorUserId: string, id: string, dto: SetRewardStatusDto) {
    const out = await inCompany(this.tenantPrisma, context, async (tx, c) => {
      const referral = await tx.referral.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!referral) throw new NotFoundException('Referral not found');
      const [row] = await this.buildRows(tx, [referral], false);
      const sourceRef = `referral:${id}`;
      let payMonth: string | null = null;
      const outside = dto.paidVia === 'outside';
      if (dto.rewardStatus === 'paid' && referral.rewardStatus !== 'paid') {
        if (row!.bonusDue !== 'due')
          throw new ConflictException(
            row!.bonusDue === 'on-hold'
              ? 'Their resignation is waiting for approval, so the bonus is on hold. Mark it paid after the exit is decided.'
              : row!.bonusDue === 'left' ? 'They left before the qualifying day, so no bonus is due.' : row!.bonusDue === 'waiting' ? `The bonus is due on ${dayLabel(row!.eligibleOn!)}. Mark it paid after that.` : 'The bonus is due only after the person is hired and completes the qualifying days.',
          );
        if (outside) await this.paidOutside(tx, c, referral, row!, actorUserId);
        else payMonth = await this.toPayroll(tx, c, referral, row!, actorUserId);
      } else if (dto.rewardStatus !== 'paid' && referral.rewardStatus === 'paid') {
        if (row!.paidVia === 'outside') await this.undoOutside(tx, c, sourceRef);
        else await this.fromPayroll(tx, c, sourceRef);
      }
      await tx.referral.update({ where: { id }, data: { rewardStatus: dto.rewardStatus, rewardNote: dto.rewardNote ?? null } });
      const paidVia = dto.rewardStatus === 'paid' ? (referral.rewardStatus === 'paid' ? row!.paidVia : outside ? 'outside' : 'payroll') : null;
      return { before: referral.rewardStatus, amount: row!.bonusInr, payMonth, paidVia, undone: referral.rewardStatus === 'paid' && dto.rewardStatus !== 'paid' ? row!.paidVia : null };
    });
    await this.audit.record(context, { actorUserId, action: 'referral.reward_updated', entityType: 'referral', entityId: id, metadata: { before: out.before, rewardStatus: dto.rewardStatus, ...(dto.rewardStatus === 'paid' ? { amountInr: out.amount, payMonth: out.payMonth, paidVia: out.paidVia } : {}), ...(out.undone ? { undonePaidVia: out.undone } : {}) } });
    return { id, rewardStatus: dto.rewardStatus, ...(out.payMonth ? { payMonth: out.payMonth } : {}), ...(out.paidVia ? { paidVia: out.paidVia } : {}) };
  }

  /** Answer 231: the one-time Referral bonus line for the referrer, in this month or the next open one (up to 3 ahead). */
  private async toPayroll(tx: Tx, c: CompanyContext, referral: { id: string; referrerUserId: string }, row: ReferralRow, by: string): Promise<string> {
    const employee = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: referral.referrerUserId }, select: { id: true } });
    if (!employee) throw new ConflictException('The person who referred has no employee record, so payroll cannot pay the bonus. Link their sign-in to their employee record first.');
    let month = istDay(new Date()).slice(0, 7);
    for (let i = 0; i < 3; i++) {
      try {
        await this.intake.oneTime(tx, c, { source: 'm10', sourceRef: `referral:${referral.id}`, employeeId: employee.id, componentCode: 'referral_bonus', amount: String(row.bonusInr), month, reason: `Referral bonus: ${row.candidateName} (${row.jobTitle})`, by });
        return month;
      } catch (e) {
        const body = e instanceof HttpException ? (e.getResponse() as { code?: string }) : null;
        if (body?.code === 'PERIOD_LOCKED') {
          month = nextMonth(month);
          continue;
        }
        if (e instanceof NotFoundException) throw new ConflictException(`The person who referred is not employed in ${month}, so payroll cannot pay the bonus.`);
        throw e;
      }
    }
    throw new ConflictException('The next three pay months are locked. Ask payroll to open a month, then mark it paid.');
  }

  /**
   * Answer 285: the bonus was paid outside payroll (a referrer with no employee record, or HR's choice). No pay line; the
   * Referral bonus cost is posted at once for this month (India time), linked to the referral.
   */
  private async paidOutside(tx: Tx, c: CompanyContext, referral: { id: string; jobId: string }, row: ReferralRow, by: string): Promise<void> {
    await tx.recruitingCost.create({
      data: { organizationId: c.organizationId, origin: OUTSIDE, sourceRef: `referral:${referral.id}`, jobId: referral.jobId, source: `Referral: ${row.candidateName}`.slice(0, 120), costType: 'referral_bonus', amount: row.bonusInr, currency: 'INR', period: new Date(`${istDay(new Date()).slice(0, 7)}-01T00:00:00Z`), note: 'Referral bonus paid outside payroll', enteredBy: by },
    });
  }

  /**
   * Undo a bonus paid outside payroll: the posted cost is removed while its quarter is still open (recruiting costs are
   * entered and changed only for months of the current quarter, answer 206); after that it is part of a closed quarter's
   * cost per hire and is refused with the reason.
   */
  private async undoOutside(tx: Tx, c: CompanyContext, sourceRef: string): Promise<void> {
    const cost = await tx.recruitingCost.findFirst({ where: { organizationId: c.organizationId, origin: OUTSIDE, sourceRef } });
    if (cost?.period) {
      const month = cost.period.toISOString().slice(0, 7);
      const q = quarterIst(new Date());
      if (month < q.from.slice(0, 7)) throw new ConflictException(`The bonus cost is in the ${month} recruiting costs, a quarter that is closed, so it cannot be undone here. Enter a correction in Recruiting costs instead.`);
    }
    await tx.recruitingCost.deleteMany({ where: { organizationId: c.organizationId, origin: OUTSIDE, sourceRef } });
  }

  /** Undo "paid": the line is cancelled while no approved run has paid it; the cost goes with it. */
  private async fromPayroll(tx: Tx, c: CompanyContext, sourceRef: string): Promise<void> {
    const org = c.organizationId;
    const entities = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
    const paidIn = await withPayScope(tx, entities, async () => {
      const line = await tx.oneTimePay.findFirst({ where: { organizationId: org, source: 'm10', sourceRef, status: { not: 'cancelled' } }, select: { id: true } });
      if (!line) return null;
      const slips = (await tx.payslipLine.findMany({ where: { organizationId: org, sourceRef: line.id }, select: { payslipId: true } })).map((l) => l.payslipId);
      const run = slips.length ? await tx.payslip.findFirst({ where: { organizationId: org, id: { in: slips }, status: { in: ['approved', 'paid'] } }, select: { periodStart: true } }) : null;
      return run ? istDay(run.periodStart).slice(0, 7) : null;
    });
    if (paidIn) throw new ConflictException(`The bonus was paid in the approved ${paidIn} payroll, so it cannot be undone here. Payroll recovers it if needed.`);
    await this.intake.cancelOneTime(tx, c, { source: 'm10', sourceRef });
    await tx.recruitingCost.deleteMany({ where: { organizationId: org, origin: 'payroll', sourceRef } });
  }

  // Batch-resolve the candidate/job/entry-status (+ referrer for the recruiter view) for a set of
  // referral rows -- Referral stores plain ids, so joins are manual (matches the getBoard pattern).
  private async buildRows(
    tx: any,
    referrals: { id: string; candidateId: string; jobId: string; entryId: string; referrerUserId: string; note: string | null; rewardStatus: string; rewardNote: string | null; bonusInr: number | null; createdAt: Date; organizationId: string }[],
    includeReferrer: boolean,
  ): Promise<ReferralRow[]> {
    if (referrals.length === 0) return [];
    const candidates = (await tx.candidate.findMany({ where: { id: { in: referrals.map((r) => r.candidateId) } }, select: { id: true, name: true, email: true } })) as { id: string; name: string; email: string }[];
    const jobs = (await tx.job.findMany({ where: { id: { in: referrals.map((r) => r.jobId) } }, select: { id: true, title: true } })) as { id: string; title: string }[];
    const entries = (await tx.pipelineEntry.findMany({
      where: { id: { in: referrals.map((r) => r.entryId) } },
      select: { id: true, rejected: true, archivedAt: true, job: { select: { pipelineId: true } }, status: { select: { name: true, stage: { select: { name: true, category: true, position: true } } } } },
    })) as { id: string; rejected: boolean; archivedAt: Date | null; job: { pipelineId: string | null }; status: { name: string; stage: { name: string; category: string; position: number } | null } | null }[];
    // The first active stage of each pipeline: a referral still there shows as "Applied".
    const pipelineIds = [...new Set(entries.map((e) => e.job.pipelineId).filter((x): x is string => !!x))];
    const firstActive = new Map<string, number>();
    for (const st of (await tx.pipelineStage.findMany({ where: { pipelineId: { in: pipelineIds }, category: 'active' }, select: { pipelineId: true, position: true } })) as { pipelineId: string; position: number }[])
      firstActive.set(st.pipelineId, Math.min(st.position, firstActive.get(st.pipelineId) ?? Infinity));
    const offers = (await tx.offer.findMany({ where: { pipelineEntryId: { in: referrals.map((r) => r.entryId) }, status: 'accepted' }, orderBy: { respondedAt: 'desc' }, select: { id: true, pipelineEntryId: true, startDate: true } })) as { id: string; pipelineEntryId: string; startDate: Date }[];
    // Founder answer 205: the real joining day and any exit come from People (the joiner made from the accepted offer).
    const joiners = offers.length ? ((await tx.preboarding.findMany({ where: { offerId: { in: offers.map((o) => o.id) } }, select: { offerId: true, joiningOn: true, employmentId: true } })) as { offerId: string; joiningOn: Date; employmentId: string | null }[]) : [];
    const employments = joiners.map((j) => j.employmentId).filter((x): x is string => !!x);
    const exits = employments.length ? ((await tx.exitCase.findMany({ where: { employmentId: { in: employments }, status: { notIn: ['submitted', 'withdrawn', 'rejected'] } }, select: { employmentId: true, approvedLwd: true, standardLwd: true } })) as { employmentId: string; approvedLwd: Date | null; standardLwd: Date }[]) : [];
    // Answer 234: a resignation waiting for approval puts the bonus on hold (only an accepted exit cancels it).
    const pendingExit = new Set(employments.length ? ((await tx.exitCase.findMany({ where: { employmentId: { in: employments }, exitType: 'resignation', status: 'submitted' }, select: { employmentId: true } })) as { employmentId: string }[]).map((e) => e.employmentId) : []);
    const joinedByEntry = new Map<string, { on: string; employmentId: string | null }>();
    for (const o of offers) {
      if (joinedByEntry.has(o.pipelineEntryId)) continue;
      const j = joiners.find((x) => x.offerId === o.id);
      joinedByEntry.set(o.pipelineEntryId, { on: j ? j.joiningOn.toISOString().slice(0, 10) : istDay(o.startDate), employmentId: j?.employmentId ?? null });
    }
    const lastDay = new Map(exits.map((e) => [e.employmentId, (e.approvedLwd ?? e.standardLwd).toISOString().slice(0, 10)]));
    const today = istDay(new Date());
    const policy = await readPolicy(tx, { organizationId: referrals[0]!.organizationId, isSuperAdmin: false });
    const referrers = includeReferrer
      ? ((await tx.user.findMany({ where: { id: { in: referrals.map((r) => r.referrerUserId) } }, select: { id: true, name: true } })) as { id: string; name: string }[])
      : [];
    // Answer 285: paid outside payroll = the referral has an outside-payroll cost row.
    const paidOutside = new Set(((await tx.recruitingCost.findMany({ where: { origin: OUTSIDE, sourceRef: { in: referrals.map((r) => `referral:${r.id}`) } }, select: { sourceRef: true } })) as { sourceRef: string }[]).map((x) => x.sourceRef));
    const employeeUsers = includeReferrer ? new Set(((await tx.employee.findMany({ where: { userId: { in: referrals.map((r) => r.referrerUserId) } }, select: { userId: true } })) as { userId: string }[]).map((e) => e.userId)) : null;
    const candidateById = new Map(candidates.map((c) => [c.id, c]));
    const jobById = new Map(jobs.map((j) => [j.id, j]));
    const entryById = new Map(entries.map((e) => [e.id, e]));
    const referrerById = new Map(referrers.map((u) => [u.id, u]));

    return referrals.map((r) => {
      const entry = entryById.get(r.entryId);
      const status = entry?.rejected ? 'Rejected' : entry?.archivedAt ? 'Archived' : entry?.status?.stage?.name ?? entry?.status?.name ?? 'In pipeline';
      const st = entry?.status?.stage;
      const stage: ReferralRow['stage'] =
        !entry || entry.rejected || entry.archivedAt || st?.category === 'rejected' ? 'Not selected' : st?.category === 'hired' ? 'Hired' : st && st.category === 'active' && entry.job.pipelineId && st.position === firstActive.get(entry.job.pipelineId) ? 'Applied' : 'In process';
      const joined = stage === 'Hired' ? joinedByEntry.get(r.entryId) ?? null : null;
      const eligibleOn = joined ? addDays(joined.on, policy.qualifyDays) : null;
      const left = joined?.employmentId ? lastDay.get(joined.employmentId) ?? null : null;
      const leftEarly = Boolean(left && eligibleOn && left < eligibleOn);
      const onHold = Boolean(joined?.employmentId && pendingExit.has(joined.employmentId));
      const bonusDue: ReferralRow['bonusDue'] = r.rewardStatus === 'paid' ? 'paid' : r.rewardStatus === 'rejected' || stage === 'Not selected' ? 'none' : leftEarly ? 'left' : onHold ? 'on-hold' : !eligibleOn ? 'not-hired' : eligibleOn <= today ? 'due' : 'waiting';
      return {
        stage,
        joinedOn: joined?.on ?? null,
        eligibleOn,
        leftOn: left,
        bonusDue,
        paidVia: r.rewardStatus === 'paid' ? (paidOutside.has(`referral:${r.id}`) ? 'outside' : 'payroll') : null,
        ...(employeeUsers ? { referrerIsEmployee: employeeUsers.has(r.referrerUserId) } : {}),
        bonusInr: r.rewardStatus === 'rejected' || (leftEarly && r.rewardStatus !== 'paid') ? 0 : r.bonusInr ?? policy.bonusInr,
        id: r.id,
        candidateName: candidateById.get(r.candidateId)?.name ?? '(unknown)',
        candidateEmail: candidateById.get(r.candidateId)?.email ?? '',
        jobTitle: jobById.get(r.jobId)?.title ?? '(job removed)',
        status,
        rewardStatus: r.rewardStatus,
        rewardNote: r.rewardNote,
        note: r.note,
        ...(includeReferrer ? { referrerName: referrerById.get(r.referrerUserId)?.name ?? '(unknown)' } : {}),
        createdAt: r.createdAt,
      };
    });
  }
}

async function readPolicy(tx: Tx, c: CompanyContext): Promise<ReferralPolicy> {
  return {
    bonusInr: Number(await settingFor(tx, c, 'ats.referral.bonus_inr', { legalEntityId: '' })),
    qualifyDays: Number(await settingFor(tx, c, 'ats.referral.qualify_days', { legalEntityId: '' })),
    selfApplyDays: Number(await settingFor(tx, c, 'ats.referral.self_apply_days', { legalEntityId: '' })),
  };
}

/** Answer 285: the origin of a Referral bonus cost paid outside payroll. */
const OUTSIDE = 'outside_payroll';
const nextMonth = (m: string) => { const y = Number(m.slice(0, 4)); const n = Number(m.slice(5, 7)); return n === 12 ? `${y + 1}-01` : `${y}-${String(n + 1).padStart(2, '0')}`; };
const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
