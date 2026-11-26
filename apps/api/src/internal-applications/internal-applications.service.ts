import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { TenantContext, TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';
import { validatePdfUpload } from '../public-applications/pdf-validation';
import { NotificationsService } from '../notifications/notifications.service';
import { companyContext, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { ApprovalsEngine, type Notice, type Outcome } from '../workflow/approvals-engine.service';
import { holidaysNear } from '../lifecycle/settlement';
import { workingDaysAfter } from '../lifecycle/exit-rules';
import { ApplyInternalDto } from './dto/internal-application.dto';
import { internalEligibility, roleSince, type InternalEligibility, type InternalRules } from './internal-eligibility';

/** HIR-13 design statuses (InternalApplication['status'] in yx-ui). */
export type InternalStatus = 'Applied' | 'Assessment' | 'Interview' | 'Offer' | 'Selected' | 'Not selected';

export interface InternalApplicationRow {
  entryId: string;
  jobTitle: string;
  status: InternalStatus;
  appliedAt: Date;
  /** Answer 2841: the current manager has not yet released the applicant (hiring.internal.manager_release). */
  waitingForManager: boolean;
}

export type TellManager = 'on_apply' | 'at_offer';

/** GET internal-applications/eligibility: may this person apply, why not, and what happens to their manager. */
export type EligibilityView = InternalEligibility & { managerName: string | null; tellManager: TellManager; rules: InternalRules; managerRelease: boolean };

/** Answer 2761: the approvals-engine request type for the current manager releasing someone for an internal job. */
export const RELEASE_TYPE = 'hiring.internal_release';
/** Answer 2836: working days (Monday to Friday less the company-wide holidays) the manager has before HR decides too. */
export const RELEASE_WORKING_DAYS = 5;
const LOOKUP: TenantContext = { organizationId: null, isSuperAdmin: true };

/**
 * Answer 2761: why no offer can be made on this pipeline entry yet (null: nothing stops it). The current manager must
 * release an internal applicant first when the company asked for that when they applied.
 */
export async function releaseProblem(tx: Pick<Tx, 'internalApplication'>, organizationId: string, entryId: string): Promise<string | null> {
  const a = await tx.internalApplication.findFirst({ where: { organizationId, entryId, releaseStatus: { in: ['pending', 'refused'] } }, select: { releaseStatus: true } });
  if (!a) return null;
  return a.releaseStatus === 'pending'
    ? 'Their current manager has not released them yet. You can make an offer once the manager agrees, or HR decides if the manager has not answered in 5 working days.'
    : 'Their current manager did not release them for this job, so no offer can be made.';
}

/** Answer 2836: is a release asked on `askedOn` past its 5 working days on `today`? The manager has all 5 days in full. */
export const releaseOverdue = (askedOn: string, today: string, holidays: ReadonlySet<string>) => workingDaysAfter(askedOn, RELEASE_WORKING_DAYS, holidays) < today;

const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Internal-mobility self-apply (HIR-13): a signed-in employee applies to an open job that shows on Internal jobs. The
// applicant IS the candidate (upserted on their own work email) and the attribution (referrerUserId) is the applicant;
// the entry is enteredVia='internal'. Who may apply, and when, is company policy (founder decision 6: settings
// hiring.internal.*, defaults past probation and 12 months in the current role); the current manager is told, never
// asked, when the person applies or (setting) when they reach the offer.
@Injectable()
export class InternalApplicationsService implements OnModuleInit {
  private readonly logger = new Logger(InternalApplicationsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    // Optional so older unit tests build without them (a résumé needs storage; a manager notice needs notifications).
    @Optional() private readonly blobStorage?: BlobStorageService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly engine?: ApprovalsEngine,
  ) {}

  onModuleInit() {
    this.engine?.register({ key: RELEASE_TYPE, label: 'Release for an internal job', risk: 'normal', autoActions: false, onDecided: (tx, req, o) => this.releaseDecided(tx, req, o), requesterLink: () => '/yx/hiring/internal-jobs' });
  }

  /** Answer 2761: the manager (or HR after the wait) decided; an offer can follow only once released. */
  private async releaseDecided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: Outcome) {
    const org = req.organizationId;
    const n = await tx.internalApplication.updateMany({ where: { organizationId: org, releaseWfRequestId: req.id, releaseStatus: 'pending' }, data: { releaseStatus: outcome === 'approved' ? 'approved' : 'refused' } });
    if (n.count) await AuditService.recordIn(tx, { organizationId: org, isSuperAdmin: false }, { actorUserId: null, action: outcome === 'approved' ? 'internal_application.released' : 'internal_application.release_refused', entityType: 'internal_application', entityId: req.subjectId, metadata: { wfRequestId: req.id } });
  }

  /**
   * Answer 2761 (hourly, safe to rerun): a release with no decision after 5 working days (Monday to Friday less the
   * company-wide holidays, answer 2836) goes to the company's HR Admins too; any of them, or the manager, decides. The
   * engine's own timeout would go to the manager's manager, so this is the module's own. Claimed by release_hr_at.
   */
  async releaseHandOver(now = new Date(), only?: string[]): Promise<number> {
    const engine = this.engine;
    if (!engine) return 0;
    const orgs = await this.tenantPrisma.forTenant(LOOKUP, (tx) => tx.internalApplication.groupBy({ by: ['organizationId'], where: { releaseStatus: 'pending', releaseHrAt: null, ...(only ? { organizationId: { in: only } } : {}) } }));
    let n = 0;
    for (const { organizationId } of orgs) {
      const ctx: TenantContext = { organizationId, isSuperAdmin: false };
      const notices: Notice[] = [];
      try {
        n += await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
          const rows = await tx.internalApplication.findMany({ where: { organizationId, releaseStatus: 'pending', releaseHrAt: null, releaseWfRequestId: { not: null } }, orderBy: { releaseAskedAt: 'asc' }, take: 200 });
          if (!rows.length) return 0;
          const asked = (r: (typeof rows)[number]) => istDay(r.releaseAskedAt ?? r.createdAt);
          const today = istDay(now);
          const holidays = await holidaysNear(tx, organizationId, null, asked(rows[0]!), today);
          const hr = await engine.hrAdmins(tx, organizationId);
          let moved = 0;
          for (const r of rows) {
            if (!releaseOverdue(asked(r), today, holidays)) continue;
            const { count } = await tx.internalApplication.updateMany({ where: { id: r.id, releaseStatus: 'pending', releaseHrAt: null }, data: { releaseHrAt: now } });
            if (!count) continue;
            const to = await engine.handOver(tx, c, r.releaseWfRequestId!, hr, 'No answer from the manager in 5 working days: sent to HR', notices);
            await AuditService.recordIn(tx, c, { actorUserId: null, action: 'internal_application.release_to_hr', entityType: 'internal_application', entityId: r.id, metadata: { wfRequestId: r.releaseWfRequestId, hr: to } });
            moved++;
          }
          return moved;
        });
        if (notices.length) await engine.send(ctx, notices);
      } catch (e) {
        this.logger.error(`internal release hand-over ${organizationId}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  /** Open jobs that show on Internal jobs, never one the person is the hiring manager of. */
  async openJobs(context: TenantContext, userId: string) {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.job.findMany({
        where: { status: 'open', internalOpen: true, deletedAt: null, OR: [{ hiringManagerId: null }, { hiringManagerId: { not: userId } }] },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, title: true, location: true, department: true, employmentType: true, createdAt: true, publishedAt: true },
      }),
    );
    return rows.map(({ createdAt, publishedAt, ...j }) => ({ ...j, postedAt: publishedAt ?? createdAt }));
  }

  async eligibility(context: TenantContext, userId: string): Promise<EligibilityView> {
    return inCompany(this.tenantPrisma, context, async (tx, c) => (await this.check(tx, c, userId)).view);
  }

  /** The facts from People (India time) and the company's rules; the employee and their manager for apply. */
  private async check(tx: Tx, c: CompanyContext, userId: string) {
    const org = c.organizationId;
    const today = istDay(new Date());
    const day = new Date(`${today}T00:00:00Z`);
    const rules: InternalRules = {
      afterProbation: (await settingFor(tx, c, 'hiring.internal.after_probation', { legalEntityId: '' })) === 'on',
      monthsInRole: Number(await settingFor(tx, c, 'hiring.internal.months_in_role', { legalEntityId: '' })),
    };
    const tellManager = (await settingFor(tx, c, 'hiring.internal.tell_manager', { legalEntityId: '' })) as TellManager;
    const managerRelease = (await settingFor(tx, c, 'hiring.internal.manager_release', { legalEntityId: '' })) === 'on';
    const employee = await tx.employee.findFirst({ where: { organizationId: org, userId }, select: { id: true } });
    const employment = employee
      ? await tx.employment.findFirst({ where: { organizationId: org, employeeId: employee.id, joinedOn: { lte: day }, OR: [{ exitedOn: null }, { exitedOn: { gte: day } }] }, orderBy: { joinedOn: 'desc' }, select: { id: true } })
      : null;
    const current = { validFrom: { lte: day }, OR: [{ validTo: null }, { validTo: { gte: day } }] };
    const status = employment ? (await tx.employmentStatusPeriod.findFirst({ where: { organizationId: org, employmentId: employment.id, supersededAt: null, ...current }, orderBy: { validFrom: 'desc' }, select: { status: true } }))?.status ?? null : null;
    const probation = employment && status === 'probation' ? await tx.probation.findFirst({ where: { organizationId: org, employmentId: employment.id }, select: { plannedEndOn: true } }) : null;
    const assignments = employment
      ? await tx.employeeAssignment.findMany({ where: { organizationId: org, employmentId: employment.id, supersededAt: null, validFrom: { lte: day } }, orderBy: { validFrom: 'desc' }, take: 100, select: { validFrom: true, designationId: true, managerEmployeeId: true } })
      : [];
    const managerEmployeeId = assignments[0]?.managerEmployeeId ?? null;
    const manager = managerEmployeeId ? await tx.employee.findFirst({ where: { organizationId: org, id: managerEmployeeId }, select: { userId: true, givenName: true, familyName: true, preferredName: true } }) : null;
    const result = internalEligibility(rules, {
      employed: Boolean(employment),
      status,
      probationEndsOn: probation ? iso(probation.plannedEndOn) : null,
      roleSince: roleSince(assignments.map((a) => ({ validFrom: iso(a.validFrom), designationId: a.designationId }))),
      today,
    });
    const managerName = manager ? [manager.preferredName || manager.givenName, manager.familyName].filter(Boolean).join(' ') : null;
    return { view: { ...result, managerName, tellManager, rules, managerRelease } as EligibilityView, employeeId: employee?.id ?? null, managerUserId: manager?.userId ?? null };
  }

  async apply(context: TenantContext, userId: string, dto: ApplyInternalDto) {
    const orgId = context.organizationId as string;
    const note = dto.note.trim();
    if (!note) throw new BadRequestException('Say why you are interested in this job.');

    // Check the résumé (if any) BEFORE the transaction; the upload runs outside it (blob call).
    let resumePath: string | null = null;
    if (dto.resumeBase64) {
      const checked = validatePdfUpload(Buffer.from(dto.resumeBase64, 'base64'));
      if (!checked.ok) throw new BadRequestException(checked.reason === 'too_large' ? 'The résumé is larger than 5 MB. Add a smaller PDF.' : 'The résumé must be a PDF file.');
      if (!this.blobStorage) throw new BadRequestException('Résumé upload is not available right now. Apply without one; your profile is used.');
      resumePath = await this.blobStorage.upload(`candidates/${orgId}/${randomUUID()}.pdf`, Buffer.from(dto.resumeBase64, 'base64'), 'application/pdf');
    }

    let out: { entryId: string; applicationId: string; jobTitle: string; managerUserId: string | null; tell: TellManager; applicantName: string; release: boolean };
    const notices: Notice[] = [];
    try {
      const c = companyContext(context);
      out = await this.tenantPrisma.forTenant(c, async (tx) => {
        const user = await tx.user.findFirst({ where: { organizationId: orgId, id: userId }, select: { email: true, name: true } });
        if (!user?.email) throw new BadRequestException('Your account has no email on file');

        // Another company's job, a deleted one, or one not shown on Internal jobs is "not found" (never confirm it exists).
        const job = await tx.job.findFirst({ where: { organizationId: orgId, id: dto.jobId, deletedAt: null, internalOpen: true }, select: { id: true, title: true, status: true, pipelineId: true, hiringManagerId: true } });
        if (!job) throw new NotFoundException('This job is not open for internal applications.');
        if (job.status !== 'open') throw new ConflictException('This job is no longer taking applications.');
        if (job.hiringManagerId === userId) throw new ForbiddenException('You are the hiring manager for this job, so you can’t apply for it.');

        const { view, employeeId, managerUserId } = await this.check(tx, c, userId);
        if (!view.eligible) throw new ForbiddenException(`${view.title}. ${view.detail}`);

        // Upsert the applicant as a candidate on their own work email. Anti-tamper: never overwrite an existing
        // candidate's stored name/phone (matches referrals.submit).
        const candidate = await tx.candidate.upsert({
          where: { organizationId_email: { organizationId: orgId, email: user.email } },
          create: { organizationId: orgId, email: user.email, name: user.name ?? user.email, portalToken: randomUUID() },
          update: { deletedAt: null, deletedByUserId: null },
        });
        if (resumePath) {
          await tx.candidateProfile.upsert({
            where: { candidateId: candidate.id },
            create: { organizationId: orgId, candidateId: candidate.id, resumePath, parseStatus: 'pending' },
            update: { resumePath, parseStatus: 'pending', parsedSummary: null, parsedSkills: null, parsedTitle: null, parsedYearsExperience: null, parsedAt: null },
          });
        }

        // First active-category stage's first status (same rule as apply()/referral).
        const pipeline = job.pipelineId
          ? await tx.pipeline.findFirst({ where: { id: job.pipelineId }, include: { stages: { orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } } } })
          : null;
        const activeStage = pipeline?.stages.find((s: { category: string }) => s.category === 'active') ?? pipeline?.stages[0];
        const statusId = activeStage?.statuses[0]?.id;

        // One application per role, whichever way the person came in.
        const existingEntry = await tx.pipelineEntry.findUnique({ where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } } });
        if (existingEntry) throw new ConflictException('You have already applied for this job.');

        const entry = await tx.pipelineEntry.create({
          data: { organizationId: orgId, jobId: job.id, candidateId: candidate.id, enteredVia: 'internal', applicationToken: randomUUID(), statusId, referrerUserId: userId },
        });
        // The hiring team reads the person's own words with the application's notes.
        await tx.pipelineFeedback.create({ data: { organizationId: orgId, entryId: entry.id, authorUserId: userId, note: `Why I am interested: ${note}` } });
        const tell = view.tellManager;
        const manager = managerUserId && managerUserId !== userId ? managerUserId : null;
        // Answer 2761: with the setting on, the manager is asked (not just told) to release the person; no offer until then.
        const release = Boolean(view.managerRelease && manager && this.engine);
        const application = await tx.internalApplication.create({
          data: { organizationId: orgId, entryId: entry.id, jobId: job.id, applicantUserId: userId, employeeId: employeeId!, note, managerUserId: manager, managerToldAt: manager && (release || tell === 'on_apply') ? new Date() : null },
        });
        const applicantName = user.name ?? user.email;
        if (release) {
          const sub = await this.engine!.submit(tx, c, {
            type: RELEASE_TYPE,
            subjectType: 'internal_application',
            subjectId: application.id,
            title: `Release ${applicantName} for the internal job ${job.title}`,
            summary: [{ label: 'Internal job', value: job.title }, { label: 'If there is no answer', value: 'HR decides after 5 working days' }],
            subjectPersonId: employeeId,
            requesterUserId: userId,
            raisedByUserId: userId,
            steps: [{ name: 'Current manager', approvers: [{ kind: 'users', userIds: [manager!] }], mode: 'any', selfApproval: 'never' }],
            payload: {},
            payloadFields: [],
            fallbackUserIds: await this.engine!.hrAdmins(tx, orgId),
            fallbackWording: { who: 'HR', check: 'Check who the person reports to.' },
          });
          notices.push(...sub.notices);
          await tx.internalApplication.update({ where: { id: application.id }, data: { releaseStatus: 'pending', releaseWfRequestId: sub.id, releaseAskedAt: new Date() } });
        }
        await recomputeGlobalStage(tx, orgId, candidate.id);
        return { entryId: entry.id, applicationId: application.id, jobTitle: job.title, managerUserId: application.managerUserId, tell, applicantName, release };
      });
    } catch (e) {
      // Two presses at once: the second loses the unique (job, candidate) race.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('You have already applied for this job.');
      throw e;
    }

    await this.audit.record(context, { actorUserId: userId, action: 'internal_application.submitted', entityType: 'pipeline_entry', entityId: out.entryId, metadata: { jobId: dto.jobId, resume: Boolean(resumePath), managerTold: out.tell === 'on_apply' && Boolean(out.managerUserId), releaseAsked: out.release } });
    if (out.release) await this.engine!.send(context, notices);
    else if (out.tell === 'on_apply' && out.managerUserId) await this.tellManager(context, userId, out.managerUserId, out.applicationId, `${out.applicantName} applied for the internal job ${out.jobTitle}`);
    return { id: out.entryId };
  }

  /**
   * Setting "at the offer": the first offer made on an internal application tells the applicant's manager (once).
   * Best effort: an offer is never refused because a notice failed.
   */
  async tellAtOffer(context: TenantContext, entryId: string) {
    try {
      const due = await inCompany(this.tenantPrisma, context, async (tx, c) => {
        if ((await settingFor(tx, c, 'hiring.internal.tell_manager', { legalEntityId: '' })) !== 'at_offer') return null;
        const a = await tx.internalApplication.findFirst({ where: { organizationId: c.organizationId, entryId, managerToldAt: null, managerUserId: { not: null } } });
        if (!a) return null;
        const claimed = await tx.internalApplication.updateMany({ where: { id: a.id, managerToldAt: null }, data: { managerToldAt: new Date() } });
        if (claimed.count === 0) return null;
        const job = await tx.job.findFirst({ where: { organizationId: c.organizationId, id: a.jobId }, select: { title: true } });
        const user = await tx.user.findFirst({ where: { organizationId: c.organizationId, id: a.applicantUserId }, select: { name: true, email: true } });
        return { a, text: `${user?.name || user?.email || 'Someone in your team'} reached the offer stage for the internal job ${job?.title ?? ''}`.trim() };
      });
      if (due) {
        await this.audit.record(context, { actorUserId: due.a.applicantUserId, action: 'internal_application.manager_told', entityType: 'pipeline_entry', entityId: entryId, metadata: { when: 'at_offer' } });
        await this.tellManager(context, due.a.applicantUserId, due.a.managerUserId!, due.a.id, due.text);
      }
    } catch (e) {
      this.logger.warn(`internal application manager notice: ${(e as Error).message}`);
    }
  }

  /** The bell row (and email) to the current manager: a fact, never a request to approve. */
  private async tellManager(context: TenantContext, applicantUserId: string, managerUserId: string, applicationId: string, text: string) {
    await this.notifications?.notify(context, applicantUserId, [managerUserId], 'hiring.internal.applied', { entityType: 'internal_application', entityId: applicationId, contextText: text, linkPath: '/yx/people/team' }).catch((e: Error) => this.logger.warn(`internal application notice: ${e.message}`));
  }

  // The staff member's own internal applications (their self-apply entries), with the role and the design's status.
  async myApplications(context: TenantContext, userId: string): Promise<InternalApplicationRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const entries = await tx.pipelineEntry.findMany({
        where: { referrerUserId: userId, enteredVia: 'internal' },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          jobId: true,
          createdAt: true,
          rejected: true,
          archivedAt: true,
          job: { select: { pipelineId: true } },
          status: { select: { name: true, stage: { select: { name: true, category: true, position: true } } } },
        },
      });
      if (entries.length === 0) return [];
      const jobs = (await tx.job.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.jobId))] } }, select: { id: true, title: true } })) as { id: string; title: string }[];
      const pipelineIds = [...new Set(entries.map((e) => e.job?.pipelineId).filter((x): x is string => Boolean(x)))];
      const firsts = pipelineIds.length ? await tx.pipelineStage.findMany({ where: { pipelineId: { in: pipelineIds }, category: 'active' }, orderBy: { position: 'asc' }, select: { pipelineId: true, position: true } }) : [];
      const firstActive = new Map<string, number>();
      for (const s of firsts) if (!firstActive.has(s.pipelineId)) firstActive.set(s.pipelineId, s.position);
      const jobById = new Map(jobs.map((j) => [j.id, j]));
      const waiting = new Set((await tx.internalApplication.findMany({ where: { entryId: { in: entries.map((e) => e.id) }, releaseStatus: 'pending' }, select: { entryId: true } })).map((a) => a.entryId));
      return entries.map((e) => ({
        entryId: e.id,
        jobTitle: jobById.get(e.jobId)?.title ?? '(role removed)',
        status: internalStatus(e.rejected, Boolean(e.archivedAt), e.status?.stage ?? null, e.job?.pipelineId ? firstActive.get(e.job.pipelineId) : undefined),
        appliedAt: e.createdAt,
        waitingForManager: waiting.has(e.id),
      }));
    });
  }
}

/**
 * The design's status from the pipeline: rejected or archived = Not selected; the offer and hired stages; the first active
 * stage = Applied; a stage named for a test or assessment = Assessment; any later stage = Interview.
 */
export function internalStatus(rejected: boolean, archived: boolean, stage: { name: string; category: string; position: number } | null, firstActivePosition: number | undefined): InternalStatus {
  if (rejected || archived || stage?.category === 'rejected' || stage?.category === 'archived') return 'Not selected';
  if (!stage) return 'Applied';
  if (stage.category === 'hired') return 'Selected';
  if (stage.category === 'offer') return 'Offer';
  if (firstActivePosition === undefined || stage.position <= firstActivePosition) return 'Applied';
  return /assess|test|exam/i.test(stage.name) ? 'Assessment' : 'Interview';
}

/**
 * HIR-13: an internal applicant's current manager (as recorded when they applied) never sees the application on the board
 * or its notes, unless they are the job's own hiring manager. The entries hidden from `viewerUserId`.
 */
export async function hiddenFromManager(tx: Tx, organizationId: string, viewerUserId: string, entryIds: string[]): Promise<Set<string>> {
  if (!entryIds.length) return new Set();
  const rows = await tx.internalApplication.findMany({ where: { organizationId, managerUserId: viewerUserId, entryId: { in: entryIds } }, select: { entryId: true, jobId: true } });
  if (!rows.length) return new Set();
  const own = new Set((await tx.job.findMany({ where: { organizationId, id: { in: rows.map((r) => r.jobId) }, hiringManagerId: viewerUserId }, select: { id: true } })).map((j) => j.id));
  return new Set(rows.filter((r) => !own.has(r.jobId)).map((r) => r.entryId));
}
