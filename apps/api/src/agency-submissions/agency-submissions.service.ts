import { randomUUID } from 'crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService, BlobStorageService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { expandedName } from '../walk-in/walk-in.service';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';
import { JobsService } from '../jobs/jobs.service';

const STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type AgencySubmissionStatus = (typeof STATUSES)[number];

@Injectable()
export class AgencySubmissionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
    private readonly audit: AuditService,
    private readonly jobsService: JobsService,
  ) {}

  async list(context: TenantContext, status: AgencySubmissionStatus = 'pending') {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.agencySubmission.findMany({
        where: { status },
        orderBy: { createdAt: 'desc' },
        include: {
          agency: { select: { name: true } },
          job: { select: { title: true } },
        },
      }),
    );
    return Promise.all(
      rows.map(async (row: any) => ({
        id: row.id,
        agencyName: row.agency.name,
        jobTitle: row.job.title,
        candidateName: row.candidateName,
        candidateEmail: row.candidateEmail,
        candidatePhone: row.candidatePhone,
        isDuplicate: row.isDuplicate,
        status: row.status,
        createdAt: row.createdAt,
        resumeUrl: await this.blobStorage.signIfOurs(row.resumePath),
      })),
    );
  }

  private async fetchPending(tx: any, id: string) {
    const submission = await tx.agencySubmission.findFirst({ where: { id } });
    if (!submission) throw new NotFoundException(`Agency submission ${id} not found`);
    if (submission.status !== 'pending') throw new ConflictException('This submission has already been reviewed');
    return submission;
  }

  async accept(context: TenantContext, id: string, userId: string) {
    const organizationId = context.organizationId as string;
    const candidateId = await this.tenantPrisma.forTenant(context, async (tx) => {
      const submission = await this.fetchPending(tx, id);

      // Same upsert-by-org-email idiom as apply()/WalkInService.register: an existing candidate's
      // name/phone is never overwritten by a submission, aside from expandedName's narrow
      // placeholder-expansion exception. A recruiter reviewing a duplicate submission attaches it
      // to the candidate who's already there instead of tampering with their details.
      const existingCandidate = await tx.candidate.findUnique({
        where: { organizationId_email: { organizationId, email: submission.candidateEmail } },
      });
      const nameUpdate = existingCandidate ? expandedName(existingCandidate.name, submission.candidateName) : null;
      const candidate = await tx.candidate.upsert({
        where: { organizationId_email: { organizationId, email: submission.candidateEmail } },
        // NOTE: the design doc describes stamping `Candidate.source = 'agency'` as "the existing
        // free-text source string" -- but Candidate has no `source` column in this schema (only
        // Invitation/CandidateEmail/AiCreditUsage do; confirmed via schema.prisma + migration
        // history). Adding one is a schema change outside this task's file list, so attribution
        // stays exactly what the brief's Interfaces section already gives it: the AgencySubmission
        // row itself (agencyId + jobId), same as the doc's own fallback sentence.
        create: {
          organizationId,
          email: submission.candidateEmail,
          name: submission.candidateName,
          phone: submission.candidatePhone ?? null,
          portalToken: randomUUID(),
        },
        // Unfiltered by the soft-delete extension, same as apply() -- resurrects a soft-deleted
        // candidate that matches this email instead of leaving it hidden.
        update: { ...(nameUpdate ? { name: nameUpdate } : {}), deletedAt: null, deletedByUserId: null },
      });

      // Existing candidates (pre-portal) may lack a token; mint one so every accepted candidate
      // gets a portal link, same backfill apply() does for a returning candidate.
      if (!candidate.portalToken) {
        await tx.candidate.update({ where: { id: candidate.id }, data: { portalToken: randomUUID() } });
      }

      await tx.candidateProfile.upsert({
        where: { candidateId: candidate.id },
        create: { organizationId, candidateId: candidate.id, resumePath: submission.resumePath, parseStatus: 'pending' },
        // Re-apply reset, same as apply()'s re-apply branch: the newly-attached résumé gets
        // re-parsed instead of showing whatever the previous submission left behind.
        update: {
          resumePath: submission.resumePath,
          parseStatus: 'pending',
          parsedSummary: null,
          parsedSkills: null,
          parsedTitle: null,
          parsedYearsExperience: null,
          parsedAt: null,
        },
      });

      // Idempotent: a duplicate submission for a job the candidate is already in must not create
      // a second pipeline entry.
      const existingEntry = await tx.pipelineEntry.findFirst({ where: { candidateId: candidate.id, jobId: submission.jobId } });
      if (!existingEntry) {
        const job = await tx.job.findFirst({ where: { id: submission.jobId }, select: { pipelineId: true } });
        const pipeline = job?.pipelineId
          ? await tx.pipeline.findFirst({
              where: { id: job.pipelineId },
              include: { stages: { orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } } },
            })
          : null;
        const activeStage = pipeline?.stages.find((s: { category: string }) => s.category === 'active') ?? pipeline?.stages[0];
        const statusId = activeStage?.statuses[0]?.id;
        await tx.pipelineEntry.create({
          data: {
            organizationId,
            jobId: submission.jobId,
            candidateId: candidate.id,
            enteredVia: 'agency',
            applicationToken: randomUUID(),
            statusId,
          },
        });
      }

      await tx.agencySubmission.update({
        where: { id },
        data: { status: 'accepted', candidateId: candidate.id, reviewedByUserId: userId, reviewedAt: new Date() },
      });

      // Last write in the tx: an accepted agency submission always makes the candidate at least
      // 'engaged' (same idiom as apply()'s recompute) -- without this, a re-engaged candidate keeps
      // a stale globalStage from before this pipeline entry existed.
      await recomputeGlobalStage(tx, organizationId, candidate.id);

      return candidate.id;
    });

    // Outside the tx, same as apply() -- enqueues the newly-attached résumé for re-parsing.
    // Attribution is the reviewing recruiter (a real authenticated actor here, unlike apply()'s
    // unauthenticated public endpoint, which falls back to job.createdById).
    await this.jobsService.enqueue(context, 'resume_parse', JSON.stringify({ candidateId }), userId);

    await this.audit.record(context, {
      actorUserId: userId,
      action: 'agency_submission.accepted',
      entityType: 'agency_submission',
      entityId: id,
      metadata: { candidateId },
    });

    return { id, status: 'accepted', candidateId };
  }

  async reject(context: TenantContext, id: string, userId: string) {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      await this.fetchPending(tx, id);
      await tx.agencySubmission.update({
        where: { id },
        data: { status: 'rejected', reviewedByUserId: userId, reviewedAt: new Date() },
      });
    });

    await this.audit.record(context, {
      actorUserId: userId,
      action: 'agency_submission.rejected',
      entityType: 'agency_submission',
      entityId: id,
    });

    return { id, status: 'rejected' };
  }
}
