import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenantContext, TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';
import { validatePdfUpload } from '../public-applications/pdf-validation';
import { SubmitReferralDto, SetRewardStatusDto } from './dto/referral.dto';

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
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
    private readonly jobsService: JobsService,
    private readonly audit: AuditService,
  ) {}

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
        data: { organizationId: orgId, referrerUserId, jobId: job.id, candidateId: candidate.id, entryId: entry.id, note: dto.note ?? null },
      });
      await recomputeGlobalStage(tx, orgId, candidate.id);
      return { referral, candidateId: candidate.id, isNew: !existing };
    });

    // Parse the résumé for search/autofill (best-effort, inert until AI keyed), like apply().
    if (resumePath) {
      await this.jobsService.enqueue(context, 'resume_parse', JSON.stringify({ candidateId }), referrerUserId).catch((e) => this.logger.warn(`resume_parse enqueue failed: ${e instanceof Error ? e.message : e}`));
    }
    await this.audit.record(context, { actorUserId: referrerUserId, action: 'referral.submitted', entityType: 'referral', entityId: referral.id, metadata: { jobId: dto.jobId, isNewCandidate: isNew } });
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

  async setReward(context: TenantContext, actorUserId: string, id: string, dto: SetRewardStatusDto) {
    const referral = await this.tenantPrisma.forTenant(context, (tx) => tx.referral.findFirst({ where: { id } }));
    if (!referral) throw new NotFoundException('Referral not found');
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.referral.update({ where: { id }, data: { rewardStatus: dto.rewardStatus, rewardNote: dto.rewardNote ?? null } }),
    );
    await this.audit.record(context, { actorUserId, action: 'referral.reward_updated', entityType: 'referral', entityId: id, metadata: { rewardStatus: dto.rewardStatus } });
    return { id, rewardStatus: dto.rewardStatus };
  }

  // Batch-resolve the candidate/job/entry-status (+ referrer for the recruiter view) for a set of
  // referral rows -- Referral stores plain ids, so joins are manual (matches the getBoard pattern).
  private async buildRows(
    tx: any,
    referrals: { id: string; candidateId: string; jobId: string; entryId: string; referrerUserId: string; note: string | null; rewardStatus: string; rewardNote: string | null; createdAt: Date }[],
    includeReferrer: boolean,
  ): Promise<ReferralRow[]> {
    if (referrals.length === 0) return [];
    const candidates = (await tx.candidate.findMany({ where: { id: { in: referrals.map((r) => r.candidateId) } }, select: { id: true, name: true, email: true } })) as { id: string; name: string; email: string }[];
    const jobs = (await tx.job.findMany({ where: { id: { in: referrals.map((r) => r.jobId) } }, select: { id: true, title: true } })) as { id: string; title: string }[];
    const entries = (await tx.pipelineEntry.findMany({
      where: { id: { in: referrals.map((r) => r.entryId) } },
      select: { id: true, rejected: true, archivedAt: true, status: { select: { name: true, stage: { select: { name: true } } } } },
    })) as { id: string; rejected: boolean; archivedAt: Date | null; status: { name: string; stage: { name: string } | null } | null }[];
    const referrers = includeReferrer
      ? ((await tx.user.findMany({ where: { id: { in: referrals.map((r) => r.referrerUserId) } }, select: { id: true, name: true } })) as { id: string; name: string }[])
      : [];
    const candidateById = new Map(candidates.map((c) => [c.id, c]));
    const jobById = new Map(jobs.map((j) => [j.id, j]));
    const entryById = new Map(entries.map((e) => [e.id, e]));
    const referrerById = new Map(referrers.map((u) => [u.id, u]));

    return referrals.map((r) => {
      const entry = entryById.get(r.entryId);
      const status = entry?.rejected ? 'Rejected' : entry?.archivedAt ? 'Archived' : entry?.status?.stage?.name ?? entry?.status?.name ?? 'In pipeline';
      return {
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
