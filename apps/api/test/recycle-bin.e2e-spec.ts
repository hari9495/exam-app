import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService, TenantPrismaService, PrismaModule } from '@exam-platform/shared';
import { randomUUID } from 'crypto';
import { RecycleBinService } from '../src/recycle-bin/recycle-bin.service';

// Real-DB coverage for Task 5, mirroring soft-delete-for-tenant.e2e-spec.ts's harness (same
// PrismaModule bootstrap, same real DB) -- proves list/restore/purge against the actual RLS +
// soft-delete-filtered client, not a mocked tx, for all four recycle-bin-eligible entities.
describe('RecycleBinService (real DB)', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let service: RecycleBinService;
  let planId: string;
  let orgId: string;
  const context = () => ({ organizationId: orgId, isSuperAdmin: false });

  let liveCandidateId: string;
  let deletedCandidateId: string;
  let liveJobId: string;
  let deletedJobId: string;
  let livePipelineId: string;
  let deletedPipelineId: string;
  let liveWalkInGroupId: string;
  let deletedWalkInGroupId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    service = new RecycleBinService(tenantPrisma);

    const plan = await prisma.plan.create({
      data: { name: 'test-plan-recycle-bin', candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 100 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({
      data: { name: 'Org Recycle Bin', slug: `org-recycle-bin-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const live = await tenantPrisma.forTenant(context(), (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, email: `live-${randomUUID()}@candidate.test`, name: 'Live Candidate' } }),
    );
    liveCandidateId = live.id;
    const deletedCandidate = await tenantPrisma.forTenant(context(), (tx) =>
      tx.candidate.create({ data: { organizationId: orgId, email: `deleted-${randomUUID()}@candidate.test`, name: 'Deleted Candidate' } }),
    );
    deletedCandidateId = deletedCandidate.id;

    const liveJob = await tenantPrisma.forTenant(context(), (tx) =>
      tx.job.create({ data: { organizationId: orgId, title: 'Live Job', createdById: randomUUID() } }),
    );
    liveJobId = liveJob.id;
    const deletedJob = await tenantPrisma.forTenant(context(), (tx) =>
      tx.job.create({ data: { organizationId: orgId, title: 'Deleted Job', createdById: randomUUID() } }),
    );
    deletedJobId = deletedJob.id;

    const livePipeline = await tenantPrisma.forTenant(context(), (tx) => tx.pipeline.create({ data: { organizationId: orgId, name: 'Live Pipeline' } }));
    livePipelineId = livePipeline.id;
    const deletedPipeline = await tenantPrisma.forTenant(context(), (tx) => tx.pipeline.create({ data: { organizationId: orgId, name: 'Deleted Pipeline' } }));
    deletedPipelineId = deletedPipeline.id;

    const liveWalkInGroup = await tenantPrisma.forTenant(context(), (tx) => tx.walkInGroup.create({ data: { organizationId: orgId, name: 'Live Walk-In' } }));
    liveWalkInGroupId = liveWalkInGroup.id;
    const deletedWalkInGroup = await tenantPrisma.forTenant(context(), (tx) =>
      tx.walkInGroup.create({ data: { organizationId: orgId, name: 'Deleted Walk-In' } }),
    );
    deletedWalkInGroupId = deletedWalkInGroup.id;

    const deleterUserId = randomUUID();
    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.candidate.update({ where: { id: deletedCandidateId }, data: { deletedAt: new Date(), deletedByUserId: deleterUserId } }),
    );
    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.job.update({ where: { id: deletedJobId }, data: { deletedAt: new Date(), deletedByUserId: deleterUserId } }),
    );
    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.pipeline.update({ where: { id: deletedPipelineId }, data: { deletedAt: new Date(), deletedByUserId: deleterUserId } }),
    );
    await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
      tx.walkInGroup.update({ where: { id: deletedWalkInGroupId }, data: { deletedAt: new Date(), deletedByUserId: deleterUserId } }),
    );
  });

  afterAll(async () => {
    const superAdminCtx = { organizationId: null as unknown as string, isSuperAdmin: true };
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.walkInGroup.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.job.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.pipeline.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant(superAdminCtx, (tx) => tx.organization.delete({ where: { id: orgId } }));
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  describe('list', () => {
    it('returns all four soft-deleted rows (and not the live ones), with the right entityType/label', async () => {
      const entries = await service.list(context());
      const byId = new Map(entries.map((e) => [e.id, e]));

      expect(byId.get(deletedCandidateId)).toEqual(
        expect.objectContaining({ entityType: 'candidate', label: 'Deleted Candidate', deletedByUserId: expect.any(String) }),
      );
      expect(byId.get(deletedJobId)).toEqual(expect.objectContaining({ entityType: 'job', label: 'Deleted Job' }));
      expect(byId.get(deletedPipelineId)).toEqual(expect.objectContaining({ entityType: 'pipeline', label: 'Deleted Pipeline' }));
      expect(byId.get(deletedWalkInGroupId)).toEqual(expect.objectContaining({ entityType: 'walk-in-group', label: 'Deleted Walk-In' }));

      expect(byId.has(liveCandidateId)).toBe(false);
      expect(byId.has(liveJobId)).toBe(false);
      expect(byId.has(livePipelineId)).toBe(false);
      expect(byId.has(liveWalkInGroupId)).toBe(false);
    });

    it('sorts newest-deleted first', async () => {
      const older = await tenantPrisma.forTenant(context(), (tx) => tx.pipeline.create({ data: { organizationId: orgId, name: `Older-${randomUUID()}` } }));
      await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
        tx.pipeline.update({ where: { id: older.id }, data: { deletedAt: new Date('2020-01-01') } }),
      );
      const newer = await tenantPrisma.forTenant(context(), (tx) => tx.pipeline.create({ data: { organizationId: orgId, name: `Newer-${randomUUID()}` } }));
      await tenantPrisma.forTenantIncludingDeleted(context(), (tx) =>
        tx.pipeline.update({ where: { id: newer.id }, data: { deletedAt: new Date('2030-01-01') } }),
      );

      const entries = await service.list(context());
      const newerIdx = entries.findIndex((e) => e.id === newer.id);
      const olderIdx = entries.findIndex((e) => e.id === older.id);
      expect(newerIdx).toBeGreaterThanOrEqual(0);
      expect(olderIdx).toBeGreaterThan(newerIdx);
    });
  });

  describe('restore', () => {
    it('un-hides a soft-deleted row: it becomes visible again via a normal forTenant read', async () => {
      const restored = await service.restore(context(), 'walk-in-group', deletedWalkInGroupId);
      expect(restored.deletedAt).toBeNull();

      const visible = await tenantPrisma.forTenant(context(), (tx) => tx.walkInGroup.findUnique({ where: { id: deletedWalkInGroupId } }));
      expect(visible).not.toBeNull();
      expect(visible?.deletedAt).toBeNull();
      expect(visible?.deletedByUserId).toBeNull();

      const stillInBin = await service.list(context());
      expect(stillInBin.some((e) => e.id === deletedWalkInGroupId)).toBe(false);
    });

    it('404s restoring a row that is not soft-deleted', async () => {
      await expect(service.restore(context(), 'candidate', liveCandidateId)).rejects.toThrow(NotFoundException);
    });

    it('404s restoring an id that does not exist at all', async () => {
      await expect(service.restore(context(), 'job', randomUUID())).rejects.toThrow(NotFoundException);
    });

    // A real unique-collision (a live row occupying the same (organizationId, name/email) slot
    // while another row sits soft-deleted) isn't reproducible against this DB: the unique
    // constraints (walk_in_groups_organization_id_name_key, candidates' organizationId_email) are
    // plain, non-partial indexes -- they're enforced regardless of deletedAt, so attempting to
    // CREATE a second live row with the same key while the first is soft-deleted fails at that
    // create step (P2002) rather than leaving two rows to collide on restore later (same reason
    // Task 4 found `candidate.upsert` -- not `create` -- was the only way to "reuse" a
    // soft-deleted row's key). The restore() P2002->409 mapping is exercised with a mocked Prisma
    // error instead, in recycle-bin.service.spec.ts, as defensive/forward-compatible handling.
  });

  describe('purge', () => {
    it('hard-deletes a soft-deleted row: gone from both forTenant and forTenantIncludingDeleted', async () => {
      await service.purge(context(), 'candidate', deletedCandidateId);

      const viaFiltered = await tenantPrisma.forTenant(context(), (tx) => tx.candidate.findUnique({ where: { id: deletedCandidateId } }));
      expect(viaFiltered).toBeNull();
      const viaIncludingDeleted = await tenantPrisma.forTenantIncludingDeleted(context(), (tx) => tx.candidate.findUnique({ where: { id: deletedCandidateId } }));
      expect(viaIncludingDeleted).toBeNull();
    });

    it('404s purging a row that is not soft-deleted', async () => {
      await expect(service.purge(context(), 'job', liveJobId)).rejects.toThrow(NotFoundException);
    });

    it('404s purging an id that does not exist at all', async () => {
      await expect(service.purge(context(), 'pipeline', randomUUID())).rejects.toThrow(NotFoundException);
    });
  });
});
