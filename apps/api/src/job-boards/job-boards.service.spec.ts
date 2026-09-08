import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JobBoardsService } from './job-boards.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';

describe('JobBoardsService', () => {
  let service: JobBoardsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JobBoardsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(JobBoardsService);
    process.env.FRONTEND_URL = 'https://app.example.com';
  });

  function knownRequestError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code, clientVersion: 'test' });
  }

  describe('list', () => {
    it('returns each board with its feedUrl and publishedJobCount', async () => {
      const tx = {
        jobBoard: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'board-1', name: 'LinkedIn', feedToken: 'tok-1', organizationId: 'org-1' },
            { id: 'board-2', name: 'Indeed', feedToken: 'tok-2', organizationId: 'org-1' },
          ]),
        },
        jobBoardPublication: {
          groupBy: jest.fn().mockResolvedValue([{ jobBoardId: 'board-1', _count: { _all: 3 } }]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context);

      expect(tx.jobBoard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1' } }));
      expect(result).toEqual([
        { id: 'board-1', name: 'LinkedIn', feedToken: 'tok-1', organizationId: 'org-1', feedUrl: 'https://app.example.com/public/job-boards/tok-1/feed.xml', publishedJobCount: 3 },
        { id: 'board-2', name: 'Indeed', feedToken: 'tok-2', organizationId: 'org-1', feedUrl: 'https://app.example.com/public/job-boards/tok-2/feed.xml', publishedJobCount: 0 },
      ]);
    });

    it('returns an empty list without querying publication counts', async () => {
      const tx = { jobBoard: { findMany: jest.fn().mockResolvedValue([]) }, jobBoardPublication: { groupBy: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context);

      expect(result).toEqual([]);
      expect(tx.jobBoardPublication.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('mints a unique feedToken and audits the creation', async () => {
      const tx = { jobBoard: { create: jest.fn().mockResolvedValue({ id: 'board-1', name: 'LinkedIn', feedToken: 'tok-1', organizationId: 'org-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.create(context, 'user-1', { name: 'LinkedIn' });

      expect(tx.jobBoard.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'LinkedIn', feedToken: expect.any(String) },
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'board-1', name: 'LinkedIn', feedUrl: 'https://app.example.com/public/job-boards/tok-1/feed.xml', publishedJobCount: 0 }),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job_board.created', entityId: 'board-1' }));
    });

    it('rejects a blank name without hitting the database', async () => {
      await expect(service.create(context, 'user-1', { name: '   ' })).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('surfaces a duplicate name as a conflict', async () => {
      const tx = { jobBoard: { create: jest.fn().mockRejectedValue(knownRequestError('P2002')) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.create(context, 'user-1', { name: 'LinkedIn' })).rejects.toThrow(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('renames an existing board and audits the update', async () => {
      const tx = {
        jobBoard: {
          findFirst: jest.fn().mockResolvedValue({ id: 'board-1', name: 'Old Name', feedToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn().mockResolvedValue({ id: 'board-1', name: 'New Name', feedToken: 'tok-1', organizationId: 'org-1' }),
        },
        jobBoardPublication: { count: jest.fn().mockResolvedValue(2) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.update(context, 'user-1', 'board-1', { name: 'New Name' });

      expect(tx.jobBoard.update).toHaveBeenCalledWith({ where: { id: 'board-1' }, data: { name: 'New Name' } });
      expect(result).toEqual(
        expect.objectContaining({ id: 'board-1', name: 'New Name', feedUrl: 'https://app.example.com/public/job-boards/tok-1/feed.xml', publishedJobCount: 2 }),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job_board.updated', entityId: 'board-1' }));
    });

    it('throws when the board does not exist', async () => {
      const tx = { jobBoard: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'missing', { name: 'New Name' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a blank name without renaming', async () => {
      const tx = {
        jobBoard: {
          findFirst: jest.fn().mockResolvedValue({ id: 'board-1', name: 'Old Name', feedToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'board-1', { name: '   ' })).rejects.toThrow(BadRequestException);
      expect(tx.jobBoard.update).not.toHaveBeenCalled();
    });

    it('surfaces a duplicate name as a conflict', async () => {
      const tx = {
        jobBoard: {
          findFirst: jest.fn().mockResolvedValue({ id: 'board-1', name: 'Old Name', feedToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn().mockRejectedValue(knownRequestError('P2002')),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'board-1', { name: 'Taken Name' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes an existing board and audits the deletion', async () => {
      const tx = {
        jobBoard: {
          findFirst: jest.fn().mockResolvedValue({ id: 'board-1', name: 'LinkedIn', feedToken: 'tok-1', organizationId: 'org-1' }),
          delete: jest.fn().mockResolvedValue({ id: 'board-1' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.remove(context, 'user-1', 'board-1');

      expect(tx.jobBoard.delete).toHaveBeenCalledWith({ where: { id: 'board-1' } });
      expect(result).toEqual({ id: 'board-1' });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job_board.deleted', entityId: 'board-1' }));
    });

    it('throws when the board does not exist', async () => {
      const tx = { jobBoard: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
