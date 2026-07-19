import { Test } from '@nestjs/testing';
import { PublicApiService } from './public-api.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('PublicApiService', () => {
  let service: PublicApiService;
  let tenantPrisma: { forTenant: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [PublicApiService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(PublicApiService);
  });

  describe('listCandidates', () => {
    it('returns a paginated, org-scoped list', async () => {
      const tx = {
        candidate: {
          findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', name: 'Alice', email: 'a@test.com', createdAt: new Date('2026-01-01') }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listCandidates(tenant, 1, 50);

      expect(result).toEqual({
        data: [{ id: 'cand-1', name: 'Alice', email: 'a@test.com', createdAt: new Date('2026-01-01') }],
        page: 1,
        pageSize: 50,
        total: 1,
      });
      expect(tx.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' }, skip: 0, take: 50 }),
      );
    });

    it('computes skip from the requested page', async () => {
      const tx = { candidate: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.listCandidates(tenant, 3, 20);

      expect(tx.candidate.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
    });
  });

  describe('getCandidate', () => {
    it('returns null when the candidate does not belong to this org', async () => {
      const tx = { candidate: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getCandidate(tenant, 'cand-1');

      expect(result).toBeNull();
      expect(tx.candidate.findFirst).toHaveBeenCalledWith({
        where: { id: 'cand-1', organizationId: 'org-1' },
        select: { id: true, name: true, email: true, createdAt: true },
      });
    });
  });

  describe('listExams', () => {
    it('returns exam metadata without question content', async () => {
      const tx = {
        exam: {
          findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round', status: 'published', durationMinutes: 60, passCriteriaPercent: 40, createdAt: new Date('2026-01-01') }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listExams(tenant, 1, 50);

      expect(result.data[0]).not.toHaveProperty('sections');
      expect(tx.exam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          select: { id: true, title: true, status: true, durationMinutes: true, passCriteriaPercent: true, createdAt: true },
        }),
      );
    });
  });
});
