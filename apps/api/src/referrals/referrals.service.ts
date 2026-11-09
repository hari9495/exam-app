import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenantContext, TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';
import { validatePdfUpload } from '../public-applications/pdf-validation';
import { SubmitReferralDto, SetRewardStatusDto } from './dto/referral.dto';
import { inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';

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
  /** The bonus promised, whole rupees (0 when the reward was turned down). */
  bonusInr: number;
}

/** HIR-12 company policy: the bonus and the days a referred hire must complete (settings with defaults). */
export interface ReferralPolicy {
  bonusInr: number;
  qualifyDays: number;
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

      const { bonusInr } = await readPolicy(tx, { ...context, organizationId: orgId });
      const referral = await tx.referral.create({
        data: { organizationId: orgId, referrerUserId, jobId: job.id, candidateId: candidate.id, entryId: entry.id, note: dto.note ?? null, bonusInr },
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
    const offers = (await tx.offer.findMany({ where: { pipelineEntryId: { in: referrals.map((r) => r.entryId) }, status: 'accepted' }, orderBy: { respondedAt: 'desc' }, select: { pipelineEntryId: true, startDate: true } })) as { pipelineEntryId: string; startDate: Date }[];
    const joinedByEntry = new Map<string, string>();
    for (const o of offers) if (!joinedByEntry.has(o.pipelineEntryId)) joinedByEntry.set(o.pipelineEntryId, istDay(o.startDate));
    const policy = await readPolicy(tx, { organizationId: referrals[0]!.organizationId, isSuperAdmin: false });
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
      const st = entry?.status?.stage;
      const stage: ReferralRow['stage'] =
        !entry || entry.rejected || entry.archivedAt || st?.category === 'rejected' ? 'Not selected' : st?.category === 'hired' ? 'Hired' : st && st.category === 'active' && entry.job.pipelineId && st.position === firstActive.get(entry.job.pipelineId) ? 'Applied' : 'In process';
      return {
        stage,
        joinedOn: stage === 'Hired' ? joinedByEntry.get(r.entryId) ?? null : null,
        bonusInr: r.rewardStatus === 'rejected' ? 0 : r.bonusInr ?? policy.bonusInr,
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
  };
}

const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
