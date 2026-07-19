import { Test } from '@nestjs/testing';
import { PublicApiService } from './public-api.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { ExamsService } from '../exams/exams.service';

describe('PublicApiService', () => {
  let service: PublicApiService;
  let tenantPrisma: { forTenant: jest.Mock };
  let examsService: { getResults: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    examsService = { getResults: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicApiService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ExamsService, useValue: examsService },
      ],
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

  describe('listInvitations', () => {
    it('scopes by organization via the exam relation, and supports optional filters', async () => {
      const tx = {
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', invitedAt: new Date('2026-01-01'), expiresAt: new Date('2026-01-08') }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listInvitations(tenant, 1, 50, { examId: 'exam-1' });

      expect(result.total).toBe(1);
      expect(tx.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { exam: { organizationId: 'org-1' }, examId: 'exam-1' } }),
      );
    });

    it('omits absent filters from the where clause', async () => {
      const tx = { invitation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.listInvitations(tenant, 1, 50, {});

      expect(tx.invitation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { exam: { organizationId: 'org-1' } } }));
    });
  });

  describe('getExamResults', () => {
    it('strips proctoring and integrity data from the staff-facing result rows', async () => {
      examsService.getResults.mockResolvedValue([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'attempt-1', status: 'submitted',
          score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt: new Date('2026-01-01'),
          proctoringAnalysis: { status: 'completed', riskLevel: 'low', summary: 'ok' },
          integrityAnalysis: { status: 'completed', level: 'none', flagsJson: '[]', narrative: null },
          integrityLevel: 'none', integrityFlagCount: 0,
        },
      ]);

      const result = await service.getExamResults(tenant, 'exam-1', 1, 50);

      expect(result.data[0]).toEqual({
        candidateId: 'cand-1', candidateName: 'Alice', status: 'submitted',
        score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt: new Date('2026-01-01'),
      });
      expect(result.data[0]).not.toHaveProperty('proctoringAnalysis');
      expect(result.data[0]).not.toHaveProperty('integrityAnalysis');
      expect(result.data[0]).not.toHaveProperty('integrityLevel');
      expect(examsService.getResults).toHaveBeenCalledWith(tenant, 'exam-1');
    });

    it('paginates the already-fetched result rows in-memory', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({
        candidateId: `cand-${i}`, candidateName: `C${i}`, invitationId: `inv-${i}`, attemptId: null, status: 'submitted',
        score: 1, maxScore: 1, percentage: 100, passFail: 'pass', submittedAt: new Date(),
        proctoringAnalysis: null, integrityAnalysis: null, integrityLevel: null, integrityFlagCount: 0,
      }));
      examsService.getResults.mockResolvedValue(rows);

      const result = await service.getExamResults(tenant, 'exam-1', 2, 2);

      expect(result).toMatchObject({ page: 2, pageSize: 2, total: 5 });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].candidateId).toBe('cand-2');
    });
  });
});
