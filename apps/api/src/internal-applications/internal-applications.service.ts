import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { TenantContext, TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';
import { validatePdfUpload } from '../public-applications/pdf-validation';
import { NotificationsService } from '../notifications/notifications.service';
import { companyContext, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { ApplyInternalDto } from './dto/internal-application.dto';
import { internalEligibility, roleSince, type InternalEligibility, type InternalRules } from './internal-eligibility';

/** HIR-13 design statuses (InternalApplication['status'] in yx-ui). */
export type InternalStatus = 'Applied' | 'Assessment' | 'Interview' | 'Offer' | 'Selected' | 'Not selected';

export interface InternalApplicationRow {
  entryId: string;
  jobTitle: string;
  status: InternalStatus;
  appliedAt: Date;
}

export type TellManager = 'on_apply' | 'at_offer';

/** GET internal-applications/eligibility: may this person apply, why not, and what happens to their manager. */
export type EligibilityView = InternalEligibility & { managerName: string | null; tellManager: TellManager; rules: InternalRules };

const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Internal-mobility self-apply (HIR-13): a signed-in employee applies to an open job that shows on Internal jobs. The
// applicant IS the candidate (upserted on their own work email) and the attribution (referrerUserId) is the applicant;
// the entry is enteredVia='internal'. Who may apply, and when, is company policy (founder decision 6: settings
// hiring.internal.*, defaults past probation and 12 months in the current role); the current manager is told, never
// asked, when the person applies or (setting) when they reach the offer.
@Injectable()
export class InternalApplicationsService {
  private readonly logger = new Logger(InternalApplicationsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    // Optional so older unit tests build without them (a résumé needs storage; a manager notice needs notifications).
    @Optional() private readonly blobStorage?: BlobStorageService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

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
    return { view: { ...result, managerName, tellManager, rules } as EligibilityView, employeeId: employee?.id ?? null, managerUserId: manager?.userId ?? null };
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

    let out: { entryId: string; applicationId: string; jobTitle: string; managerUserId: string | null; tell: TellManager; applicantName: string };
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
        const application = await tx.internalApplication.create({
          data: { organizationId: orgId, entryId: entry.id, jobId: job.id, applicantUserId: userId, employeeId: employeeId!, note, managerUserId: managerUserId && managerUserId !== userId ? managerUserId : null, managerToldAt: tell === 'on_apply' && managerUserId && managerUserId !== userId ? new Date() : null },
        });
        await recomputeGlobalStage(tx, orgId, candidate.id);
        return { entryId: entry.id, applicationId: application.id, jobTitle: job.title, managerUserId: application.managerUserId, tell, applicantName: user.name ?? user.email };
      });
    } catch (e) {
      // Two presses at once: the second loses the unique (job, candidate) race.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('You have already applied for this job.');
      throw e;
    }

    await this.audit.record(context, { actorUserId: userId, action: 'internal_application.submitted', entityType: 'pipeline_entry', entityId: out.entryId, metadata: { jobId: dto.jobId, resume: Boolean(resumePath), managerTold: out.tell === 'on_apply' && Boolean(out.managerUserId) } });
    if (out.tell === 'on_apply' && out.managerUserId) await this.tellManager(context, userId, out.managerUserId, out.applicationId, `${out.applicantName} applied for the internal job ${out.jobTitle}`);
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
      return entries.map((e) => ({
        entryId: e.id,
        jobTitle: jobById.get(e.jobId)?.title ?? '(role removed)',
        status: internalStatus(e.rejected, Boolean(e.archivedAt), e.status?.stage ?? null, e.job?.pipelineId ? firstActive.get(e.job.pipelineId) : undefined),
        appliedAt: e.createdAt,
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
