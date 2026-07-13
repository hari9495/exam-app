import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CandidatesService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(CandidatesService);
  });

  it("creates a candidate scoped to the caller's organization", async () => {
    const tx = {
      candidate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', name: 'Alice' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.create(context, { email: 'a@test.com', name: 'Alice' });

    expect(result.id).toBe('cand-1');
    expect(tx.candidate.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', email: 'a@test.com', name: 'Alice', phone: undefined },
    });
  });

  it('rejects creating a candidate whose email already exists in the organization', async () => {
    const tx = {
      candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com' }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.create(context, { email: 'a@test.com', name: 'Alice' })).rejects.toThrow(ConflictException);
  });

  it("lists candidates scoped to the caller's organization", async () => {
    tenantPrisma.forTenant.mockResolvedValue([{ id: 'cand-1' }]);

    const result = await service.list(context, {});

    expect(result).toHaveLength(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('creates new candidates and updates existing ones from a CSV bulk upload, reporting row errors', async () => {
    const existingCandidate = { id: 'cand-existing', email: 'bob@test.com' };
    const tx = {
      candidate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existingCandidate),
        create: jest.fn().mockResolvedValue({ id: 'cand-new' }),
        update: jest.fn().mockResolvedValue({ id: 'cand-existing' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const csv = 'email,name,phone\nbad-email,Bad,\nalice@test.com,Alice,\nbob@test.com,Bob Updated,';
    const result = await service.bulkUpload(context, csv);

    expect(result.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: "bad-email"' }]);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(tx.candidate.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', email: 'alice@test.com', name: 'Alice', phone: undefined },
    });
    expect(tx.candidate.update).toHaveBeenCalledWith({
      where: { id: 'cand-existing' },
      data: { name: 'Bob Updated', phone: undefined },
    });
  });

  describe('exportData', () => {
    it('assembles the candidate\'s full data footprint with human-readable joins', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: '555-1234', createdAt: new Date('2026-01-01'),
          }),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', status: 'completed', invitedAt: new Date('2026-01-02'),
              expiresAt: new Date('2026-01-09'), revokedAt: null,
              exam: { title: 'Backend Round' },
              attempt: {
                id: 'attempt-1', status: 'submitted', startedAt: new Date('2026-01-03'),
                submittedAt: new Date('2026-01-03'), deviceFingerprint: 'fp-abc',
                result: { score: 5, maxScore: 10, percentage: 50, passFail: 'pass' },
                answers: [
                  {
                    selectedOptionIdsJson: JSON.stringify(['opt-a']),
                    isCorrect: true, marksAwarded: 5,
                    question: { text: 'What is 2+2?', options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] },
                  },
                ],
                proctoringEvents: [
                  { eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-01-03'), metadataJson: JSON.stringify({ count: 2 }) },
                ],
                proctoringAnalysis: { status: 'completed', riskLevel: 'low', summary: 'No issues observed.' },
                insight: { status: 'completed', summary: 'Strong fundamentals.' },
                messages: [{ body: 'Please stay in frame', sentAt: new Date('2026-01-03'), readAt: null }],
              },
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(result.candidate).toEqual({
        id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: '555-1234', createdAt: new Date('2026-01-01'),
      });
      expect(result.invitations).toEqual([
        { id: 'inv-1', examTitle: 'Backend Round', status: 'completed', invitedAt: new Date('2026-01-02'), expiresAt: new Date('2026-01-09'), revokedAt: null },
      ]);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].examTitle).toBe('Backend Round');
      expect(result.attempts[0].result).toEqual({ score: 5, maxScore: 10, percentage: 50, passFail: 'pass' });
      expect(result.attempts[0].answers).toEqual([
        { questionText: 'What is 2+2?', selectedOptions: ['4'], isCorrect: true, marksAwarded: 5 },
      ]);
      expect(result.attempts[0].proctoringEvents).toEqual([
        { eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-01-03'), metadata: { count: 2 } },
      ]);
      expect(result.attempts[0].messages).toEqual([
        { body: 'Please stay in frame', sentAt: new Date('2026-01-03'), readAt: null },
      ]);
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'candidate.data_exported', entityType: 'candidate', entityId: 'cand-1',
      });
    });

    it('handles an invitation with no attempt yet', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: null, createdAt: new Date('2026-01-01') }),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', status: 'invited', invitedAt: new Date('2026-01-02'), expiresAt: new Date('2026-01-09'), revokedAt: null,
              exam: { title: 'Backend Round' }, attempt: null,
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(result.invitations).toHaveLength(1);
      expect(result.attempts).toEqual([]);
    });

    it('throws NotFoundException (and does not audit) for a candidate outside the caller organization', async () => {
      const tx = { candidate: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.exportData(context, 'user-1', 'cand-x')).rejects.toThrow(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('erase', () => {
    function makeEraseTx(overrides: { candidate?: Record<string, unknown> } = {}) {
      return {
        candidate: {
          findFirst: jest.fn().mockResolvedValue(
            overrides.candidate ?? { id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: '555-1234', erasedAt: null },
          ),
          update: jest.fn(),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ id: 'inv-1' }, { id: 'inv-2' }]),
          updateMany: jest.fn(),
        },
        attempt: {
          findMany: jest.fn().mockResolvedValue([{ id: 'attempt-1' }]),
          updateMany: jest.fn(),
        },
        candidateMessage: { updateMany: jest.fn() },
        proctoringEvent: { updateMany: jest.fn() },
        proctoringAnalysis: { updateMany: jest.fn() },
        attemptInsight: { updateMany: jest.fn() },
        candidateRefreshToken: { deleteMany: jest.fn() },
      };
    }

    it('scrubs every PII-bearing field, deletes session tokens, and revokes live invitations atomically', async () => {
      const tx = makeEraseTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(tx.candidate.update).toHaveBeenCalledWith({
        where: { id: 'cand-1' },
        data: { name: 'Redacted', email: 'erased-cand-1@redacted.invalid', phone: null, erasedAt: expect.any(Date) },
      });
      expect(tx.attempt.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['attempt-1'] } }, data: { deviceFingerprint: null },
      });
      expect(tx.candidateMessage.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] } }, data: { body: '[redacted]' },
      });
      expect(tx.proctoringEvent.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] } }, data: { metadataJson: null },
      });
      expect(tx.proctoringAnalysis.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] }, summary: { not: null } }, data: { summary: '[redacted]' },
      });
      expect(tx.attemptInsight.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] }, summary: { not: null } }, data: { summary: '[redacted]' },
      });
      expect(tx.candidateRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: { invitationId: { in: ['inv-1', 'inv-2'] } },
      });
      expect(tx.invitation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['inv-1', 'inv-2'] }, status: 'invited' },
        data: { status: 'revoked', revokedAt: expect.any(Date) },
      });
      expect(result.id).toBe('cand-1');
      expect(result.erasedAt).toEqual(expect.any(Date));
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'candidate.erased', entityType: 'candidate', entityId: 'cand-1',
      });
    });

    it('is idempotent: an already-erased candidate is a no-op with no re-scrub and no second audit entry', async () => {
      const previouslyErasedAt = new Date('2026-06-01');
      const tx = makeEraseTx({
        candidate: { id: 'cand-1', email: 'erased-cand-1@redacted.invalid', name: 'Redacted', phone: null, erasedAt: previouslyErasedAt },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: previouslyErasedAt });
      expect(tx.candidate.update).not.toHaveBeenCalled();
      expect(tx.candidateRefreshToken.deleteMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws NotFoundException (and touches nothing) for a candidate outside the caller organization', async () => {
      const tx = makeEraseTx();
      tx.candidate.findFirst.mockResolvedValue(null);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.erase(context, 'user-1', 'cand-x')).rejects.toThrow(NotFoundException);
      expect(tx.candidate.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
