import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService, TenantPrismaService, PrismaModule } from '@exam-platform/shared';
import { randomUUID } from 'crypto';
import { RecycleBinRetentionService, RETENTION_DAYS } from '../src/recycle-bin/recycle-bin-retention.service';

// Real-DB coverage for Task 6, mirroring recycle-bin.e2e-spec.ts's harness (same PrismaModule
// bootstrap, same real DB) -- proves prune() hard-deletes soft-deleted rows past the 30-day
// cutoff across all four recycle-bin entities, leaves newer soft-deleted + live rows alone, and
// (the carry-forward FK case) skips a row that's still FK-referenced instead of aborting the rest
// of the batch.
describe('RecycleBinRetentionService (real DB)', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let service: RecycleBinRetentionService;
  let planId: string;
  let orgId: string;
  const context = () => ({ organizationId: orgId, isSuperAdmin: false });
  const superAdminCtx = { organizationId: null as unknown as string, isSuperAdmin: true };

  // now() fixed so "older than 30 days" / "newer than 30 days" is deterministic regardless of
  // when the suite runs.
  const now = new Date('2026-09-07T00:00:00.000Z');
  const OLD = new Date(now.getTime() - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
  const RECENT = new Date(now.getTime() - (RETENTION_DAYS - 25) * 24 * 60 * 60 * 1000);

  let liveCandidateId: string;
  let oldDeletedCandidateId: string;
  let recentDeletedCandidateId: string;

  let livePipelineId: string;
  let oldDeletedPipelineId: string;
  // A pipeline that's soft-deleted, past the cutoff, but still referenced by a live Job
  // (Job.pipelineId -> Pipeline is onDelete: NoAction) -- must be skipped, not abort the batch.
  let fkBlockedPipelineId: string;
  let blockingJobId: string;

  // Finding 2 (whole-branch review): a job hard-deleted by the scheduled purge must also sweep
  // its CustomFieldValue rows (EAV table, no FK to Job) -- otherwise they orphan forever.
  let oldDeletedJobWithCfvId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    service = new RecycleBinRetentionService(tenantPrisma);

    const plan = await prisma.plan.create({
      data: { name: 'test-plan-recycle-bin-retention', candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 100 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({
      data: { name: 'Org Recycle Bin Retention', slug: `org-recycle-bin-retention-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const live = await tenantPrisma.forTenant(context(), (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, email: `live-${randomUUID()}@candidate.test`, name: 'Live Candidate' } }),
    );
    liveCandidateId = live.id;

    const oldDeleted = await tenantPrisma.forTenant(context(), (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, email: `old-${randomUUID()}@candidate.test`, name: 'Old Deleted Candidate' } }),
    );
    oldDeletedCandidateId = oldDeleted.id;

    const recentDeleted = await tenantPrisma.forTenant(context(), (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, email: `recent-${randomUUID()}@candidate.test`, name: 'Recently Deleted Candidate' } }),
    );
    recentDeletedCandidateId = recentDeleted.id;

    const livePipeline = await tenantPrisma.forTenant(context(), (tx) => tx.pipeline.create({ data: { organizationId: orgId, name: 'Live Pipeline' } }));
    livePipelineId = livePipeline.id;

    const oldDeletedPipeline = await tenantPrisma.forTenant(context(), (tx) =>
      tx.pipeline.create({ data: { organizationId: orgId, name: 'Old Deleted Pipeline' } }),
    );
    oldDeletedPipelineId = oldDeletedPipeline.id;

    const fkBlockedPipeline = await tenantPrisma.forTenant(context(), (tx) =>
      tx.pipeline.create({ data: { organizationId: orgId, name: 'FK Blocked Pipeline' } }),
    );
    fkBlockedPipelineId = fkBlockedPipeline.id;
    // A live Job pointing at fkBlockedPipeline -- NoAction FK means the pipeline can't hard-delete
    // while this job references it.
    const blockingJob = await tenantPrisma.forTenant(context(), (tx) =>
      tx.job.create({ data: { organizationId: orgId, title: 'Job blocking pipeline purge', createdById: randomUUID(), pipelineId: fkBlockedPipelineId } }),
    );
    blockingJobId = blockingJob.id;

    const oldDeletedJobWithCfv = await tenantPrisma.forTenant(context(), (tx) =>
      tx.job.create({ data: { organizationId: orgId, title: 'Old Deleted Job With Custom Fields', createdById: randomUUID() } }),
    );
    oldDeletedJobWithCfvId = oldDeletedJobWithCfv.id;
    // No CustomFieldDefinition FK on CustomFieldValue.definitionId -- a random id is enough to
    // prove the entityType+entityId sweep. Routed through forTenant, not the raw `prisma` client:
    // custom_field_values carries the same RLS as every other tenant table (BLOCK PREDICATE AFTER
    // INSERT), which rejects a write made without the session context forTenant sets up.
    await tenantPrisma.forTenant(context(), (tx) =>
      tx.customFieldValue.create({
        data: { organizationId: orgId, definitionId: randomUUID(), entityType: 'job', entityId: oldDeletedJobWithCfvId, valueText: 'Engineering' },
      }),
    );

    // Soft-delete with explicit deletedAt timestamps (directly, via the raw client) -- prune()
    // reads deletedAt, so the seeded value IS the thing under test.
    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.candidate.update({ where: { id: oldDeletedCandidateId }, data: { deletedAt: OLD } }),
    );
    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.candidate.update({ where: { id: recentDeletedCandidateId }, data: { deletedAt: RECENT } }),
    );
    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.pipeline.update({ where: { id: oldDeletedPipelineId }, data: { deletedAt: OLD } }),
    );
    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.pipeline.update({ where: { id: fkBlockedPipelineId }, data: { deletedAt: OLD } }),
    );
    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.job.update({ where: { id: oldDeletedJobWithCfvId }, data: { deletedAt: OLD } }),
    );
  });

  afterAll(async () => {
    // Mops up anything a failed assertion left behind -- the test itself expects prune() to have
    // already removed these.
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.customFieldValue.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.job.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.pipeline.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.organization.delete({ where: { id: orgId } }));
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('hard-deletes soft-deleted rows past the 30-day cutoff, retains newer soft-deleted + live rows, and skips an FK-blocked row without aborting the rest', async () => {
    const purgedCount = await service.prune(now);

    // The one due-and-purgeable candidate + the one due-and-purgeable pipeline + the one
    // due-and-purgeable job. The FK-blocked pipeline is due (deletedAt < cutoff) but must be
    // skipped, not counted.
    expect(purgedCount).toBeGreaterThanOrEqual(3);

    const oldCandidateGone = await tenantPrisma.forTenantIncludingDeleted(context(), (tx) => tx.candidate.findUnique({ where: { id: oldDeletedCandidateId } }));
    expect(oldCandidateGone).toBeNull();

    const oldPipelineGone = await tenantPrisma.forTenantIncludingDeleted(context(), (tx) => tx.pipeline.findUnique({ where: { id: oldDeletedPipelineId } }));
    expect(oldPipelineGone).toBeNull();

    // Retained: newer soft-deleted candidate (inside the 30-day window).
    const recentCandidateStillThere = await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.candidate.findUnique({ where: { id: recentDeletedCandidateId } }),
    );
    expect(recentCandidateStillThere).not.toBeNull();
    expect(recentCandidateStillThere?.deletedAt).not.toBeNull();

    // Retained: live rows, untouched.
    const liveCandidateStillThere = await tenantPrisma.forTenant(context(), (tx) => tx.candidate.findUnique({ where: { id: liveCandidateId } }));
    expect(liveCandidateStillThere).not.toBeNull();
    const livePipelineStillThere = await tenantPrisma.forTenant(context(), (tx) => tx.pipeline.findUnique({ where: { id: livePipelineId } }));
    expect(livePipelineStillThere).not.toBeNull();

    // FK-blocked pipeline: still there (skipped, not hard-deleted) -- and the batch wasn't aborted
    // by its P2003, proven by the sibling old-deleted rows above actually being gone.
    const blockedPipelineStillThere = await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.pipeline.findUnique({ where: { id: fkBlockedPipelineId } }),
    );
    expect(blockedPipelineStillThere).not.toBeNull();
    expect(blockedPipelineStillThere?.deletedAt).not.toBeNull();

    // Finding 2: the scheduled purge hard-deleted the old job, and swept its customFieldValue
    // rows along with it (EAV table, no FK to Job -- nothing else would clean these up).
    const oldJobWithCfvGone = await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.job.findUnique({ where: { id: oldDeletedJobWithCfvId } }),
    );
    expect(oldJobWithCfvGone).toBeNull();
    const cfvRowsGone = await tenantPrisma.forTenant(context(), (tx) =>
      tx.customFieldValue.findMany({ where: { entityType: 'job', entityId: oldDeletedJobWithCfvId } }),
    );
    expect(cfvRowsGone).toHaveLength(0);

    // Cleanup the still-referencing job before afterAll's deleteMany so teardown isn't itself
    // FK-blocked (deleteMany would otherwise hit the same NoAction constraint).
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.job.delete({ where: { id: blockingJobId } }));
  });
});
