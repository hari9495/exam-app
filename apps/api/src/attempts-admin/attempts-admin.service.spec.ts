import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AttemptsAdminService } from './attempts-admin.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';

describe('AttemptsAdminService', () => {
  let service: AttemptsAdminService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let examRuntime: {
    forceSubmit: jest.Mock;
    unblock: jest.Mock;
    reanalyze: jest.Mock;
    notifyMessageSent: jest.Mock;
    regenerateInsight: jest.Mock;
    generateCodeReview: jest.Mock;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    examRuntime = {
      forceSubmit: jest.fn(),
      unblock: jest.fn(),
      reanalyze: jest.fn(),
      notifyMessageSent: jest.fn(),
      regenerateInsight: jest.fn(),
      generateCodeReview: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptsAdminService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: ExamRuntimeInternalClient, useValue: examRuntime },
      ],
    }).compile();
    service = moduleRef.get(AttemptsAdminService);
  });

  describe('listProctoringEvents', () => {
    it('throws NotFoundException when the attempt is not in the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.listProctoringEvents(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the ordered proctoring events for an owned attempt', async () => {
      const events = [{ id: 'event-1' }];
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listProctoringEvents(context, 'attempt-1');

      expect(tx.proctoringEvent.findMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1' }, orderBy: { occurredAt: 'asc' } });
      expect(result).toBe(events);
    });
  });

  describe('forceSubmit', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.forceSubmit(context, 'attempt-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.forceSubmit).not.toHaveBeenCalled();
    });

    it('delegates to the internal client and records an audit entry', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      examRuntime.forceSubmit.mockResolvedValue({ status: 'force_submitted' });

      const result = await service.forceSubmit(context, 'attempt-1', 'user-1');

      expect(examRuntime.forceSubmit).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.force_submit', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toEqual({ status: 'force_submitted' });
    });
  });

  describe('unblock', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.unblock(context, 'attempt-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.unblock).not.toHaveBeenCalled();
    });

    it('proxies to examRuntime.unblock and records an audit entry', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      examRuntime.unblock.mockResolvedValue({ status: 'in_progress' });

      const result = await service.unblock(context, 'attempt-1', 'user-1');

      expect(examRuntime.unblock).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.unblock', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toEqual({ status: 'in_progress' });
    });
  });

  describe('sendMessage', () => {
    it('throws NotFoundException without writing a message when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.sendMessage(context, 'attempt-1', 'user-1', 'hi')).rejects.toThrow(NotFoundException);
      expect(examRuntime.notifyMessageSent).not.toHaveBeenCalled();
    });

    it('writes the CandidateMessage row, notifies the internal client, and records an audit entry', async () => {
      const sentAt = new Date('2026-07-09T00:00:00.000Z');
      const created = { id: 'msg-1', attemptId: 'attempt-1', sentAt };
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1' }) },
        candidateMessage: { create: jest.fn().mockResolvedValue(created) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.sendMessage(context, 'attempt-1', 'user-1', 'Please stay on the exam tab');

      expect(tx.candidateMessage.create).toHaveBeenCalledWith({ data: { attemptId: 'attempt-1', sentByUserId: 'user-1', body: 'Please stay on the exam tab' } });
      expect(examRuntime.notifyMessageSent).toHaveBeenCalledWith({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.message_sent', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toEqual({ id: 'msg-1', sentAt });
    });
  });

  describe('listMessages', () => {
    it('returns the ordered messages for an owned attempt', async () => {
      const messages = [{ id: 'msg-1' }];
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue(messages) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listMessages(context, 'attempt-1');

      expect(result).toBe(messages);
    });
  });

  describe('reanalyze', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.reanalyze(context, 'user-1', 'attempt-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.reanalyze).not.toHaveBeenCalled();
    });

    it('triggers reanalysis via the internal client, then reads back the fresh ProctoringAnalysis row', async () => {
      const analysis = { attemptId: 'attempt-1', status: 'completed', riskLevel: 'high', summary: 'Copy-paste detected.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ proctoringAnalysis: { findUniqueOrThrow: jest.fn().mockResolvedValue(analysis) } });
      });

      const result = await service.reanalyze(context, 'user-1', 'attempt-1');

      expect(examRuntime.reanalyze).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.reanalyze_triggered', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toBe(analysis);
    });
  });

  describe('getInsight', () => {
    it('throws NotFoundException when the attempt is not in the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getInsight(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the attempt is owned but no insight has been generated yet', async () => {
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ attemptInsight: { findFirst: jest.fn().mockResolvedValue(null) } });
      });

      await expect(service.getInsight(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the AttemptInsight row for an owned attempt', async () => {
      const insight = { attemptId: 'attempt-1', status: 'completed', summary: 'Strong in SQL.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ attemptInsight: { findFirst: jest.fn().mockResolvedValue(insight) } });
      });

      const result = await service.getInsight(context, 'attempt-1');

      expect(result).toBe(insight);
    });
  });

  describe('regenerateInsight', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.regenerateInsight(context, 'user-1', 'attempt-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.regenerateInsight).not.toHaveBeenCalled();
    });

    it('triggers regeneration via the internal client, then reads back the fresh AttemptInsight row', async () => {
      const insight = { attemptId: 'attempt-1', status: 'completed', summary: 'Fresh summary.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ attemptInsight: { findUniqueOrThrow: jest.fn().mockResolvedValue(insight) } });
      });

      const result = await service.regenerateInsight(context, 'user-1', 'attempt-1');

      expect(examRuntime.regenerateInsight).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.insight_regenerated', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toBe(insight);
    });
  });

  describe('getCodeReview', () => {
    it('throws NotFoundException when the attempt is not in the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getCodeReview(context, 'attempt-1', 'question-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the attempt is owned but no code review has been generated yet', async () => {
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ codeAnswerReview: { findFirst: jest.fn().mockResolvedValue(null) } });
      });

      await expect(service.getCodeReview(context, 'attempt-1', 'question-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the CodeAnswerReview row for an owned attempt', async () => {
      const review = { answerId: 'answer-1', status: 'completed', suggestedMarks: 8, summary: 'Solid solution.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ codeAnswerReview: { findFirst: jest.fn().mockResolvedValue(review) } });
      });

      const result = await service.getCodeReview(context, 'attempt-1', 'question-1');

      expect(result).toBe(review);
    });
  });

  describe('regenerateCodeReview', () => {
    it('throws NotFoundException without calling the internal client when no answer is found', async () => {
      const tx = { answer: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.regenerateCodeReview(context, 'user-1', 'attempt-1', 'question-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.generateCodeReview).not.toHaveBeenCalled();
    });

    it('triggers generation via the internal client, then reads back the fresh CodeAnswerReview row', async () => {
      const review = { answerId: 'answer-1', status: 'completed', suggestedMarks: 7, summary: 'Correct logic.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ answer: { findFirst: jest.fn().mockResolvedValue({ id: 'answer-1' }) } });
        }
        return fn({ codeAnswerReview: { findFirstOrThrow: jest.fn().mockResolvedValue(review) } });
      });

      const result = await service.regenerateCodeReview(context, 'user-1', 'attempt-1', 'question-1');

      expect(examRuntime.generateCodeReview).toHaveBeenCalledWith('answer-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'attempt.code_review_regenerated',
        entityType: 'attempt',
        entityId: 'attempt-1',
        metadata: { questionId: 'question-1' },
      });
      expect(result).toBe(review);
    });
  });
});
