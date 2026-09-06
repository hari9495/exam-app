import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RecycleBinService, ENTITY_TYPES } from './recycle-bin.service';

function knownRequestError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', { code, clientVersion: 'test' });
}

describe('RecycleBinService', () => {
  let service: RecycleBinService;
  let tenantPrisma: { forTenantIncludingDeleted: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tenantPrisma = { forTenantIncludingDeleted: jest.fn() };
    service = new RecycleBinService(tenantPrisma as any);
  });

  describe('ENTITY_TYPES', () => {
    it('is the single source for the four url-safe entity types', () => {
      expect(ENTITY_TYPES).toEqual({
        candidate: { delegate: 'candidate', labelField: 'name' },
        job: { delegate: 'job', labelField: 'title' },
        pipeline: { delegate: 'pipeline', labelField: 'name' },
        'walk-in-group': { delegate: 'walkInGroup', labelField: 'name' },
      });
    });
  });

  describe('list', () => {
    it('runs a findMany per entity type against the includingDeleted client and maps + sorts the results newest-first', async () => {
      const tx = {
        candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Ann', deletedAt: new Date('2026-01-01'), deletedByUserId: 'u1' }]) },
        job: { findMany: jest.fn().mockResolvedValue([{ id: 'j1', title: 'Engineer', deletedAt: new Date('2026-03-01'), deletedByUserId: 'u2' }]) },
        pipeline: { findMany: jest.fn().mockResolvedValue([]) },
        walkInGroup: { findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context);

      expect(tenantPrisma.forTenantIncludingDeleted).toHaveBeenCalledWith(context, expect.any(Function));
      expect(tx.candidate.findMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null } },
        select: { id: true, deletedAt: true, deletedByUserId: true, name: true },
      });
      expect(tx.job.findMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null } },
        select: { id: true, deletedAt: true, deletedByUserId: true, title: true },
      });
      expect(result).toEqual([
        { entityType: 'job', id: 'j1', label: 'Engineer', deletedAt: new Date('2026-03-01'), deletedByUserId: 'u2' },
        { entityType: 'candidate', id: 'c1', label: 'Ann', deletedAt: new Date('2026-01-01'), deletedByUserId: 'u1' },
      ]);
    });
  });

  describe('restore', () => {
    it('updates deletedAt/deletedByUserId to null via the includingDeleted client, scoped to a soft-deleted row', async () => {
      const tx = { candidate: { update: jest.fn().mockResolvedValue({ id: 'c1', name: 'Ann', deletedAt: null, deletedByUserId: null }) } };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.restore(context, 'candidate', 'c1');

      expect(tx.candidate.update).toHaveBeenCalledWith({
        where: { id: 'c1', deletedAt: { not: null } },
        data: { deletedAt: null, deletedByUserId: null },
      });
      expect(result).toEqual({ entityType: 'candidate', id: 'c1', label: 'Ann', deletedAt: null, deletedByUserId: null });
    });

    it('maps P2025 (no matching soft-deleted row) to NotFoundException', async () => {
      const tx = { job: { update: jest.fn().mockRejectedValue(knownRequestError('P2025')) } };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.restore(context, 'job', 'missing')).rejects.toThrow(NotFoundException);
    });

    // Defensive mapping -- see recycle-bin.e2e-spec.ts for why a real unique collision on
    // restore can't be constructed against this schema's plain (non-partial) unique indexes;
    // this proves the P2002 branch itself surfaces as a 409 if the DB ever throws it.
    it('maps P2002 (unique collision) to ConflictException', async () => {
      const tx = { walkInGroup: { update: jest.fn().mockRejectedValue(knownRequestError('P2002')) } };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.restore(context, 'walk-in-group', 'g1')).rejects.toThrow(ConflictException);
    });

    it('rejects an unknown entityType with BadRequestException without touching the client', async () => {
      await expect(service.restore(context, 'widget' as any, 'x1')).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenantIncludingDeleted).not.toHaveBeenCalled();
    });
  });

  describe('purge', () => {
    it('hard-deletes via the includingDeleted client, scoped to a soft-deleted row', async () => {
      const tx = { pipeline: { delete: jest.fn().mockResolvedValue({ id: 'p1' }) } };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      await service.purge(context, 'pipeline', 'p1');

      expect(tx.pipeline.delete).toHaveBeenCalledWith({ where: { id: 'p1', deletedAt: { not: null } } });
    });

    it('maps P2025 (no matching soft-deleted row) to NotFoundException', async () => {
      const tx = { walkInGroup: { delete: jest.fn().mockRejectedValue(knownRequestError('P2025')) } };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.purge(context, 'walk-in-group', 'missing')).rejects.toThrow(NotFoundException);
    });

    // Real-world trigger: `Job.pipelineId -> Pipeline` and `CandidateEmail.candidateId -> Candidate`
    // are `onDelete: NoAction` FKs, so purging a Pipeline still referenced by a Job (or a Candidate
    // with any CandidateEmail row) throws P2003 -- must surface as a clean 409, never a raw 500,
    // and we never auto-cascade the hard-delete.
    it('maps P2003 (foreign-key constraint violation) to ConflictException', async () => {
      const tx = { pipeline: { delete: jest.fn().mockRejectedValue(knownRequestError('P2003')) } };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.purge(context, 'pipeline', 'p1')).rejects.toThrow(ConflictException);
    });

    it('rejects an unknown entityType with BadRequestException without touching the client', async () => {
      await expect(service.purge(context, 'widget' as any, 'x1')).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenantIncludingDeleted).not.toHaveBeenCalled();
    });
  });
});
