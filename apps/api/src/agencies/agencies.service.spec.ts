import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AgenciesService } from './agencies.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';

describe('AgenciesService', () => {
  let service: AgenciesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgenciesService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AgenciesService);
    process.env.FRONTEND_URL = 'https://app.example.com';
  });

  function knownRequestError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code, clientVersion: 'test' });
  }

  describe('list', () => {
    it('returns each agency with its portalUrl, counts, and its actual jobIds allowlist', async () => {
      const tx = {
        agency: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'agency-1', name: 'Acme Staffing', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' },
            { id: 'agency-2', name: 'Beta Recruiters', contactEmail: 'b@ex.com', active: true, portalToken: 'tok-2', organizationId: 'org-1' },
          ]),
        },
        agencyJob: {
          groupBy: jest.fn().mockResolvedValue([{ agencyId: 'agency-1', _count: { _all: 3 } }]),
          findMany: jest.fn().mockResolvedValue([
            { agencyId: 'agency-1', jobId: 'job-1' },
            { agencyId: 'agency-1', jobId: 'job-2' },
            { agencyId: 'agency-1', jobId: 'job-3' },
          ]),
        },
        agencySubmission: { groupBy: jest.fn().mockResolvedValue([{ agencyId: 'agency-2', _count: { _all: 2 } }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context);

      expect(tx.agency.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1' } }));
      expect(tx.agencySubmission.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1', status: 'pending' } }));
      expect(result).toEqual([
        {
          id: 'agency-1',
          name: 'Acme Staffing',
          contactEmail: null,
          active: true,
          portalUrl: 'https://app.example.com/agency/tok-1',
          assignedJobCount: 3,
          pendingSubmissionCount: 0,
          jobIds: ['job-1', 'job-2', 'job-3'],
        },
        {
          id: 'agency-2',
          name: 'Beta Recruiters',
          contactEmail: 'b@ex.com',
          active: true,
          portalUrl: 'https://app.example.com/agency/tok-2',
          assignedJobCount: 0,
          pendingSubmissionCount: 2,
          jobIds: [],
        },
      ]);
    });

    it('returns an empty list without querying counts', async () => {
      const tx = { agency: { findMany: jest.fn().mockResolvedValue([]) }, agencyJob: { groupBy: jest.fn(), findMany: jest.fn() }, agencySubmission: { groupBy: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      expect(await service.list(context)).toEqual([]);
      expect(tx.agencyJob.groupBy).not.toHaveBeenCalled();
      expect(tx.agencyJob.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('mints a portalToken, builds portalUrl from FRONTEND_URL, and audits', async () => {
      const tx = {
        agency: { create: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Acme Staffing', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.create(context, 'user-1', { name: 'Acme Staffing' });

      expect(tx.agency.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'Acme Staffing', contactEmail: null, active: true, portalToken: expect.any(String) },
      });
      expect(result).toEqual({
        id: 'agency-1',
        name: 'Acme Staffing',
        contactEmail: null,
        active: true,
        portalUrl: 'https://app.example.com/agency/tok-1',
        assignedJobCount: 0,
        pendingSubmissionCount: 0,
        jobIds: [],
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'agency.created', entityId: 'agency-1' }));
    });

    it('rejects a blank name without hitting the database', async () => {
      await expect(service.create(context, 'user-1', { name: '   ' })).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('surfaces a duplicate name as a conflict', async () => {
      const tx = { agency: { create: jest.fn().mockRejectedValue(knownRequestError('P2002')) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.create(context, 'user-1', { name: 'Acme Staffing' })).rejects.toThrow(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a jobId from another org and creates nothing (whole tx rolled back)', async () => {
      const tx = {
        agency: { create: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Acme Staffing', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' }) },
        job: { findMany: jest.fn().mockResolvedValue([{ id: 'job-1' }]) }, // only 1 of 2 requested ids belongs to this org
        agencyJob: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.create(context, 'user-1', { name: 'Acme Staffing', jobIds: ['job-1', 'job-cross-org'] })).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.agencyJob.createMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('renames, updates fields, reconciles the allowlist, and audits', async () => {
      const tx = {
        agency: {
          findFirst: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Old Name', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'New Name', contactEmail: 'x@ex.com', active: false, portalToken: 'tok-1', organizationId: 'org-1' }),
        },
        job: { findMany: jest.fn().mockResolvedValue([{ id: 'job-1' }]) },
        agencyJob: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn(), count: jest.fn().mockResolvedValue(1) },
        agencySubmission: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.update(context, 'user-1', 'agency-1', { name: 'New Name', contactEmail: 'x@ex.com', active: false, jobIds: ['job-1'] });

      expect(tx.agency.update).toHaveBeenCalledWith({ where: { id: 'agency-1' }, data: { name: 'New Name', contactEmail: 'x@ex.com', active: false } });
      expect(tx.agencyJob.createMany).toHaveBeenCalledWith({ data: [{ agencyId: 'agency-1', jobId: 'job-1', organizationId: 'org-1' }] });
      expect(result).toEqual(
        expect.objectContaining({ id: 'agency-1', name: 'New Name', portalUrl: 'https://app.example.com/agency/tok-1', assignedJobCount: 1, pendingSubmissionCount: 0 }),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'agency.updated', entityId: 'agency-1' }));
    });

    it('throws when the agency does not exist', async () => {
      const tx = { agency: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'missing', { name: 'New Name' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a blank rename without writing', async () => {
      const tx = {
        agency: {
          findFirst: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Old Name', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'agency-1', { name: '   ' })).rejects.toThrow(BadRequestException);
      expect(tx.agency.update).not.toHaveBeenCalled();
    });

    it('surfaces a duplicate name as a conflict', async () => {
      const tx = {
        agency: {
          findFirst: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Old Name', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn().mockRejectedValue(knownRequestError('P2002')),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'agency-1', { name: 'Existing Name' })).rejects.toThrow(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a cross-org jobId and leaves the allowlist untouched', async () => {
      const tx = {
        agency: {
          findFirst: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Acme', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Acme', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' }),
        },
        job: { findMany: jest.fn().mockResolvedValue([]) }, // requested id doesn't belong to this org
        agencyJob: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'agency-1', { jobIds: ['job-cross-org'] })).rejects.toThrow(BadRequestException);
      expect(tx.agencyJob.deleteMany).not.toHaveBeenCalled();
      expect(tx.agencyJob.createMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an agency with no submissions and audits', async () => {
      const tx = {
        agency: {
          findFirst: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Acme', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' }),
          delete: jest.fn().mockResolvedValue({ id: 'agency-1' }),
        },
        agencySubmission: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.remove(context, 'user-1', 'agency-1');

      expect(tx.agency.delete).toHaveBeenCalledWith({ where: { id: 'agency-1' } });
      expect(result).toEqual({ id: 'agency-1' });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'agency.deleted', entityId: 'agency-1' }));
    });

    it('throws when the agency does not exist', async () => {
      const tx = { agency: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('409s when submissions reference the agency, and does not delete', async () => {
      const tx = {
        agency: {
          findFirst: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Acme', contactEmail: null, active: true, portalToken: 'tok-1', organizationId: 'org-1' }),
          delete: jest.fn(),
        },
        agencySubmission: { count: jest.fn().mockResolvedValue(1) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'agency-1')).rejects.toThrow(ConflictException);
      expect(tx.agency.delete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('regenerateToken', () => {
    it('mints a new portalToken and returns the new portalUrl', async () => {
      const tx = {
        agency: {
          findFirst: jest.fn().mockResolvedValue({ id: 'agency-1', name: 'Acme', contactEmail: null, active: true, portalToken: 'old-tok', organizationId: 'org-1' }),
          update: jest.fn().mockResolvedValue({ id: 'agency-1', portalToken: 'new-tok' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.regenerateToken(context, 'user-1', 'agency-1');

      expect(tx.agency.update).toHaveBeenCalledWith({ where: { id: 'agency-1' }, data: { portalToken: expect.any(String) } });
      expect(result.portalUrl).toMatch(/^https:\/\/app\.example\.com\/agency\//);
      expect(result.portalUrl).not.toContain('old-tok');
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'agency.token_regenerated', entityId: 'agency-1' }));
    });

    it('throws when the agency does not exist', async () => {
      const tx = { agency: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.regenerateToken(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
