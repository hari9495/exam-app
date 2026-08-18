import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WalkInGroupsService } from './walk-in-groups.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';
import { PipelineService } from '../pipeline/pipeline.service';

describe('WalkInGroupsService', () => {
  let service: WalkInGroupsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let pipeline: { upsertDriveEntry: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    pipeline = { upsertDriveEntry: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WalkInGroupsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: PipelineService, useValue: pipeline },
      ],
    }).compile();
    service = moduleRef.get(WalkInGroupsService);
  });

  function knownRequestError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code, clientVersion: 'test' });
  }

  describe('list', () => {
    it('returns every group for the org, each with its member exams', async () => {
      const tx = { walkInGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'group-1', name: 'Group A', exams: [] }]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context);

      expect(tx.walkInGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' }, include: { exams: { select: { id: true, title: true } } } }),
      );
      expect(result).toEqual([{ id: 'group-1', name: 'Group A', exams: [] }]);
    });
  });

  describe('listEligibleExams', () => {
    it('returns every walk-in-enabled exam in the org, regardless of which group it is in', async () => {
      const tx = { exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round', walkInGroupId: null }]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listEligibleExams(context);

      expect(tx.exam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', walkInEnabled: true } }),
      );
      expect(result).toEqual([{ id: 'exam-1', title: 'Backend Round', walkInGroupId: null }]);
    });
  });

  describe('create', () => {
    it('creates a group with the trimmed name', async () => {
      const tx = { walkInGroup: { create: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Group A' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.create(context, 'user-1', '  Group A  ');

      expect(tx.walkInGroup.create).toHaveBeenCalledWith({ data: { organizationId: 'org-1', name: 'Group A' } });
      expect(result).toEqual({ id: 'group-1', name: 'Group A' });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'walk_in_group.created' }));
    });

    it('rejects a blank name without hitting the database', async () => {
      await expect(service.create(context, 'user-1', '   ')).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('surfaces a duplicate name as a conflict', async () => {
      const tx = { walkInGroup: { create: jest.fn().mockRejectedValue(knownRequestError('P2002')) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.create(context, 'user-1', 'Group A')).rejects.toThrow(ConflictException);
    });
  });

  describe('rename', () => {
    it('renames an existing group', async () => {
      const tx = {
        walkInGroup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Old Name' }),
          update: jest.fn().mockResolvedValue({ id: 'group-1', name: 'New Name' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.rename(context, 'user-1', 'group-1', 'New Name');

      expect(tx.walkInGroup.update).toHaveBeenCalledWith({ where: { id: 'group-1' }, data: { name: 'New Name' } });
      expect(result).toEqual({ id: 'group-1', name: 'New Name' });
    });

    it('throws when the group does not exist', async () => {
      const tx = { walkInGroup: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.rename(context, 'user-1', 'missing', 'New Name')).rejects.toThrow(NotFoundException);
    });

    it('surfaces a duplicate name as a conflict', async () => {
      const tx = {
        walkInGroup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Old Name' }),
          update: jest.fn().mockRejectedValue(knownRequestError('P2002')),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.rename(context, 'user-1', 'group-1', 'Taken Name')).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes an existing group that has no drives, same as before drives existed', async () => {
      const tx = {
        walkInGroup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Group A' }),
          delete: jest.fn().mockResolvedValue({ id: 'group-1' }),
        },
        driveSession: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.remove(context, 'user-1', 'group-1');

      expect(tx.walkInGroup.delete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
      expect(result).toEqual({ success: true });
    });

    it('throws when the group does not exist', async () => {
      const tx = { walkInGroup: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('blocks deleting a group that still has drives, and does not delete it', async () => {
      const tx = {
        walkInGroup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Group A' }),
          delete: jest.fn(),
        },
        driveSession: { count: jest.fn().mockResolvedValue(2) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'group-1')).rejects.toThrow(BadRequestException);
      expect(tx.walkInGroup.delete).not.toHaveBeenCalled();
    });
  });

  describe('setExams', () => {
    it('moves an exam out of its current group and into the new one', async () => {
      const tx = {
        walkInGroup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Group A' }),
          findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Group A', exams: [{ id: 'exam-1', title: 'Backend Round' }] }),
        },
        exam: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue([{ id: 'exam-2' }]), // exam-2 was previously the sole member
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.setExams(context, 'user-1', 'group-1', ['exam-1']);

      // exam-2 (no longer selected) gets ungrouped, exam-1 (newly selected) gets grouped -- two
      // separate updateMany calls, not one that would incorrectly also clear exam-1.
      expect(tx.exam.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['exam-2'] } }, data: { walkInGroupId: null } });
      expect(tx.exam.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['exam-1'] }, organizationId: 'org-1' },
        data: { walkInGroupId: 'group-1' },
      });
      expect(result).toEqual({ id: 'group-1', name: 'Group A', exams: [{ id: 'exam-1', title: 'Backend Round' }] });
    });

    it('clears every member when given an empty list, without adding anyone', async () => {
      const tx = {
        walkInGroup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Group A' }),
          findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Group A', exams: [] }),
        },
        exam: {
          count: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: 'exam-1' }, { id: 'exam-2' }]),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.setExams(context, 'user-1', 'group-1', []);

      expect(tx.exam.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['exam-1', 'exam-2'] } }, data: { walkInGroupId: null } });
      expect(tx.exam.count).not.toHaveBeenCalled();
    });

    it('throws when the group does not exist', async () => {
      const tx = { walkInGroup: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.setExams(context, 'user-1', 'missing', ['exam-1'])).rejects.toThrow(NotFoundException);
    });

    it('rejects an exam id that does not belong to the org', async () => {
      const tx = {
        walkInGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Group A' }) },
        exam: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.setExams(context, 'user-1', 'group-1', ['not-real'])).rejects.toThrow(BadRequestException);
    });
  });

  describe('setJob', () => {
    it('setJob links a job and backfills existing group registrants', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'group-1', jobId: 'job-1' });
      const tx = {
        walkInGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }), update },
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
        invitation: { findMany: jest.fn().mockResolvedValue([{ candidateId: 'c1' }, { candidateId: 'c1' }, { candidateId: 'c2' }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
      await service.setJob(context, 'user-1', 'group-1', 'job-1');
      expect(update).toHaveBeenCalledWith({ where: { id: 'group-1' }, data: { jobId: 'job-1' } });
      // distinct candidates c1, c2 backfilled
      expect(pipeline.upsertDriveEntry).toHaveBeenCalledTimes(2);
      expect(pipeline.upsertDriveEntry).toHaveBeenCalledWith(tx, context, 'job-1', 'c1');
      expect(pipeline.upsertDriveEntry).toHaveBeenCalledWith(tx, context, 'job-1', 'c2');
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'walk_in_group.job_linked', entityType: 'walk_in_group', entityId: 'group-1', metadata: { jobId: 'job-1' } }),
      );
    });

    it('setJob with null clears the job, does no backfill, and audits unlink', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'group-1', jobId: null });
      const tx = {
        walkInGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }), update },
        job: { findFirst: jest.fn() },
        invitation: { findMany: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.setJob(context, 'user-1', 'group-1', null);

      expect(update).toHaveBeenCalledWith({ where: { id: 'group-1' }, data: { jobId: null } });
      expect(tx.job.findFirst).not.toHaveBeenCalled();
      expect(tx.invitation.findMany).not.toHaveBeenCalled();
      expect(pipeline.upsertDriveEntry).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'walk_in_group.job_unlinked', entityType: 'walk_in_group', entityId: 'group-1', metadata: { jobId: null } }),
      );
    });

    it('throws when the group does not exist', async () => {
      const tx = { walkInGroup: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.setJob(context, 'user-1', 'missing', 'job-1')).rejects.toThrow(NotFoundException);
      expect(pipeline.upsertDriveEntry).not.toHaveBeenCalled();
    });

    it('throws when the job does not belong to the org', async () => {
      const tx = {
        walkInGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
        job: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.setJob(context, 'user-1', 'group-1', 'missing-job')).rejects.toThrow(NotFoundException);
      expect(pipeline.upsertDriveEntry).not.toHaveBeenCalled();
    });
  });
});
