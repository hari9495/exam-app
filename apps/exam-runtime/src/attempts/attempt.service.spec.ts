import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AttemptService } from './attempt.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { getProctoringEventSeverity } from './proctoring-severity';
import { PistonClient } from '../code-execution/piston-client';
import { RunLimiter } from '../code-execution/run-limiter';

describe('AttemptService', () => {
  let service: AttemptService;
  let tenantPrisma: { forTenant: jest.Mock };
  let settlement: {
    settleIfExpired: jest.Mock;
    finalize: jest.Mock;
    remainingSeconds: jest.Mock;
    registerWebcamViolation: jest.Mock;
    resumeFromPause: jest.Mock;
  };
  let monitoringGateway: { emitAttemptStatus: jest.Mock; emitProctoringFlag: jest.Mock; emitLeaderboardUpdate: jest.Mock };
  let pistonClient: { execute: jest.Mock };
  let runLimiter: { checkAndIncrement: jest.Mock };
  let leaderboardService: { computeRecruiterView: jest.Mock; computeCandidateView: jest.Mock };
  const session = { invitationId: 'inv-1' };
  const exam = {
    id: 'exam-1', organizationId: 'org-1', title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60, passCriteriaPercent: 40, randomizeOrder: false,
    schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null, feedbackVisibility: 'breakdown',
  };
  const invitationRecord = { id: 'inv-1', candidateId: 'cand-1', examId: 'exam-1', exam, extraTimePercent: 0 };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    settlement = {
      settleIfExpired: jest.fn(),
      finalize: jest.fn(),
      remainingSeconds: jest.fn(),
      registerWebcamViolation: jest.fn(),
      resumeFromPause: jest.fn(),
    };
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitProctoringFlag: jest.fn(), emitLeaderboardUpdate: jest.fn() };
    pistonClient = { execute: jest.fn() };
    runLimiter = { checkAndIncrement: jest.fn() };
    leaderboardService = { computeRecruiterView: jest.fn(), computeCandidateView: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: settlement },
        { provide: MonitoringGateway, useValue: monitoringGateway },
        { provide: PistonClient, useValue: pistonClient },
        { provide: RunLimiter, useValue: runLimiter },
        { provide: LeaderboardService, useValue: leaderboardService },
      ],
    }).compile();
    service = moduleRef.get(AttemptService);
  });

  function mockBootstrapThenScoped(scopedTx: unknown) {
    tenantPrisma.forTenant
      .mockImplementationOnce(() => Promise.resolve(invitationRecord))
      .mockImplementationOnce((_ctx, fn) => fn(scopedTx));
  }

  describe('getCurrent', () => {
    it('throws UnauthorizedException when the invitation no longer resolves', async () => {
      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(null));

      await expect(service.getCurrent(session)).rejects.toThrow(UnauthorizedException);
    });

    it('returns an exam preview with a section/question-count breakdown when no attempt has been started yet', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, questions: [{ id: 'q1' }, { id: 'q2' }] },
            { id: 'section-2', title: 'Section Two', selectionMode: 'pool', poolSize: 5, questions: [] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toEqual({
        exam: {
          title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60,
          schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null,
        },
        schedulingWindowState: null,
        sections: [
          { title: 'Section One', questionCount: 2 },
          { title: 'Section Two', questionCount: 5 },
        ],
      });
    });

    it('falls back to 0 questions for a pool section with poolSize unset', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'pool', poolSize: null, questions: [] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result.sections).toEqual([{ title: 'Section One', questionCount: 0 }]);
    });

    it('returns the effective duration (exam duration + extraTimePercent) when the invitation has an accommodation', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, extraTimePercent: 50 }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      // toMatchObject, not toEqual: Task 3 (later in this plan) adds a `sections` field to this
      // same pre-start response shape — this test only cares about the duration math.
      expect(result).toMatchObject({
        exam: {
          title: 'Backend Round', instructions: 'Be honest', durationMinutes: 90,
          schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null,
        },
        schedulingWindowState: null,
      });
    });

    it('returns the full attempt state with sections, questions (no isCorrect), and existing answers', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: 20, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isMarkedForReview: false }]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toEqual({
        status: 'in_progress',
        remainingSeconds: 3300,
        exam: { title: 'Backend Round' },
        sections: [
          { title: 'Section One', targetDurationMinutes: 20, questions: [{ id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] }] },
        ],
        answers: [{ questionId: 'q1', selectedOptionIds: ['opt-a'], isMarkedForReview: false }],
        messages: [],
        feedback: null,
      });
      expect((result as any).sections[0].questions[0]).not.toHaveProperty('isCorrect');
    });

    it('includes codeLanguage and starterCode for a code question so the candidate\'s editor can be configured', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['code-q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['code-q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'code-q1', text: 'Reverse a string', type: 'code', marks: 10, codeLanguage: 'python', starterCode: 'def reverse(s):\n    pass', allowStdin: true, options: [] },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).sections[0].questions[0]).toEqual({
        id: 'code-q1', text: 'Reverse a string', type: 'code', marks: 10,
        codeLanguage: 'python', starterCode: 'def reverse(s):\n    pass', allowStdin: true, options: [],
      });
      expect((result as any).sections[0].questions.find((q: any) => q.type === 'code')?.allowStdin).toBe(true);
    });

    it('reorders a question\'s options according to optionOrderJson when present', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: JSON.stringify({ q1: ['opt-b', 'opt-a'] }),
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).sections[0].questions[0].options).toEqual([{ id: 'opt-b', text: '5' }, { id: 'opt-a', text: '4' }]);
    });

    it('returns unread messages and marks them read', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: '[]', sectionSnapshotJson: '[]', optionOrderJson: null,
      };
      const unreadMessage = { id: 'msg-1', body: 'Please stay on the exam tab', sentAt: new Date('2026-07-09T00:00:00Z') };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([unreadMessage]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(1000);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).messages).toEqual([{ id: 'msg-1', body: 'Please stay on the exam tab', sentAt: unreadMessage.sentAt }]);
      expect(tx.candidateMessage.findMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1', readAt: null } });
      expect(tx.candidateMessage.updateMany).toHaveBeenCalledWith({
        where: { attemptId: 'attempt-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('resolves tenant context via an unscoped bootstrap lookup followed by a properly scoped call', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockBootstrapThenScoped(tx);

      await service.getCurrent(session);

      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        1,
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        2,
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
    });

    it('returns feedback: null while the attempt is still in_progress', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(100);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toMatchObject({ feedback: null });
    });

    it('returns a pending_review feedback status for an attempt awaiting manual grading, regardless of feedbackVisibility', async () => {
      const attempt = {
        id: 'attempt-1', status: 'pending_manual_grade', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'code', marks: 10, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 0, maxScore: 10, percentage: 0, passFail: null }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).feedback).toEqual({ status: 'pending_review', visibility: 'breakdown', passFail: null, percentage: null, sections: null });
    });

    it('returns pass/fail only when feedbackVisibility is pass_fail', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 5, maxScore: 5, percentage: 100, passFail: 'pass' }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      mockBootstrapThenScoped(tx);
      const examWithVisibility = { ...invitationRecord, exam: { ...exam, feedbackVisibility: 'pass_fail' } };
      tenantPrisma.forTenant.mockReset();
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(examWithVisibility))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect((result as any).feedback).toEqual({ status: 'settled', visibility: 'pass_fail', passFail: 'pass', percentage: null, sections: null });
    });

    it('returns no result data when feedbackVisibility is none', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 5, maxScore: 5, percentage: 100, passFail: 'pass' }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      const examWithVisibility = { ...invitationRecord, exam: { ...exam, feedbackVisibility: 'none' } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(examWithVisibility))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect((result as any).feedback).toEqual({ status: 'settled', visibility: 'none', passFail: null, percentage: null, sections: null });
    });

    it('returns pass/fail and percentage, but no section breakdown, when feedbackVisibility is score', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 3, maxScore: 5, percentage: 60, passFail: 'fail' }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      const examWithVisibility = { ...invitationRecord, exam: { ...exam, feedbackVisibility: 'score' } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(examWithVisibility))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect((result as any).feedback).toEqual({ status: 'settled', visibility: 'score', passFail: 'fail', percentage: 60, sections: null });
    });

    it('returns section-level scores when feedbackVisibility is breakdown', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1', 'q2']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1', 'q2'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn()
            .mockResolvedValueOnce([
              { id: 'q1', text: 'Q1', type: 'single_mcq', marks: 5, options: [] },
              { id: 'q2', text: 'Q2', type: 'single_mcq', marks: 5, options: [] },
            ])
            .mockResolvedValueOnce([{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }]),
        },
        answer: {
          findMany: jest.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              { questionId: 'q1', marksAwarded: 5 },
              { questionId: 'q2', marksAwarded: 0 },
            ]),
        },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 5, maxScore: 10, percentage: 50, passFail: 'fail' }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      const examWithVisibility = { ...invitationRecord, exam: { ...exam, feedbackVisibility: 'breakdown' } };
      tenantPrisma.forTenant.mockReset();
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(examWithVisibility))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect((result as any).feedback).toEqual({
        status: 'settled', visibility: 'breakdown', passFail: 'fail', percentage: 50,
        sections: [{ title: 'Section One', score: 5, maxScore: 10 }],
      });
    });
  });

  describe('start', () => {
    it('creates a new attempt snapshotting the question order and section structure when none exists', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      const result = await service.start(session, { consent: true });

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(tx.attempt.create).toHaveBeenCalledWith({
        data: {
          invitationId: 'inv-1', candidateId: 'cand-1', examId: 'exam-1',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1', 'q2'] }]),
          optionOrderJson: null,
          deviceFingerprint: undefined,
          consentAt: expect.any(Date),
        },
      });
    });

    it('records a device fingerprint on the attempt when the client provides one', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { deviceFingerprint: 'fp-abc123', consent: true });

      expect(tx.attempt.create).toHaveBeenCalledWith({
        data: {
          invitationId: 'inv-1', candidateId: 'cand-1', examId: 'exam-1',
          questionOrderJson: JSON.stringify(['q1']),
          sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
          optionOrderJson: null,
          deviceFingerprint: 'fp-abc123',
          consentAt: expect.any(Date),
        },
      });
    });

    it('resolves tenant context via an unscoped bootstrap lookup followed by a properly scoped call', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        1,
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        2,
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
    });

    it('returns the existing attempt unchanged when one already exists (idempotent)', async () => {
      const existing = { id: 'attempt-1', status: 'in_progress' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
      mockBootstrapThenScoped(tx);

      const result = await service.start(session);

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('emits attempt:status when a new attempt is created', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      expect(monitoringGateway.emitAttemptStatus).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: 'cand-1', status: 'in_progress',
      });
    });

    it('does not emit again when returning an already-existing attempt (idempotent path)', async () => {
      const existing = { id: 'attempt-1', status: 'in_progress' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
      mockBootstrapThenScoped(tx);

      await service.start(session);

      expect(monitoringGateway.emitAttemptStatus).not.toHaveBeenCalled();
    });

    it('preserves a fixed section\'s stored order when randomizeOrder is off', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }, { questionId: 'q3' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      expect(tx.attempt.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ questionOrderJson: JSON.stringify(['q1', 'q2', 'q3']) }) }),
      );
    });

    it('captures each section\'s targetDurationMinutes in the snapshot at start time', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: 20, poolTags: [], questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      const createdData = tx.attempt.create.mock.calls[0][0].data;
      const snapshot = JSON.parse(createdData.sectionSnapshotJson);
      expect(snapshot).toEqual([
        { sectionId: 'section-1', title: 'Section One', targetDurationMinutes: 20, questionIds: ['q1'] },
        { sectionId: 'section-2', title: 'Section Two', targetDurationMinutes: null, questionIds: ['q2'] },
      ]);
    });

    it('draws a pool section\'s questions matching tag and difficulty criteria, up to poolSize', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Pool Section', selectionMode: 'pool', poolSize: 2, poolDifficulty: 'hard', poolTags: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }], questions: [] },
          ]),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      expect(tx.question.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1', status: 'active', difficulty: 'hard',
          AND: [{ tags: { some: { tagId: 'tag-1' } } }, { tags: { some: { tagId: 'tag-2' } } }],
        },
        select: { id: true },
      });
      const createdData = tx.attempt.create.mock.calls[0][0].data;
      const questionIds: string[] = JSON.parse(createdData.questionOrderJson);
      expect(questionIds).toHaveLength(2);
      questionIds.forEach((id) => expect(['q1', 'q2', 'q3']).toContain(id));
    });

    it('builds optionOrderJson for every selected question when randomizeOrder is on', async () => {
      const randomizedExam = { ...exam, randomizeOrder: true };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([{ id: 'q1', options: [{ id: 'opt-a' }, { id: 'opt-b' }, { id: 'opt-c' }] }]),
        },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: randomizedExam }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      await service.start(session, { consent: true });

      const createdData = tx.attempt.create.mock.calls[0][0].data;
      expect(createdData.optionOrderJson).not.toBeNull();
      const optionOrder = JSON.parse(createdData.optionOrderJson);
      expect([...optionOrder.q1].sort()).toEqual(['opt-a', 'opt-b', 'opt-c']);
    });

    it('leaves optionOrderJson null when randomizeOrder is off', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      const createdData = tx.attempt.create.mock.calls[0][0].data;
      expect(createdData.optionOrderJson).toBeNull();
    });

    it('rejects with BadRequestException mentioning consent when starting a new attempt without consent', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      };
      mockBootstrapThenScoped(tx);

      await expect(service.start(session, {})).rejects.toThrow(/consent/i);
    });

    it('does not call tx.attempt.create when consent is missing', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      };
      mockBootstrapThenScoped(tx);

      await expect(service.start(session, {})).rejects.toThrow(BadRequestException);
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('sets consentAt on the attempt when consent is true', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      expect(tx.attempt.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ consentAt: expect.any(Date) }) }),
      );
    });

    it('returns the existing attempt regardless of consent when one already exists', async () => {
      const existing = { id: 'attempt-1', status: 'in_progress' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
      mockBootstrapThenScoped(tx);

      const result = await service.start(session, {});

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });
  });

  describe('scheduling', () => {
    const notYetOpenExam = {
      ...exam,
      schedulingEnabled: true,
      availabilityWindowStart: new Date(Date.now() + 60 * 60 * 1000),
      availabilityWindowEnd: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };
    const closedExam = {
      ...exam,
      schedulingEnabled: true,
      availabilityWindowStart: new Date(Date.now() - 2 * 60 * 60 * 1000),
      availabilityWindowEnd: new Date(Date.now() - 60 * 60 * 1000),
    };
    const openExam = {
      ...exam,
      schedulingEnabled: true,
      availabilityWindowStart: new Date(Date.now() - 60 * 60 * 1000),
      availabilityWindowEnd: new Date(Date.now() + 60 * 60 * 1000),
    };

    function mockInvitationWithExam(scopedTx: unknown, scheduledExam: Record<string, unknown>) {
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: scheduledExam }))
        .mockImplementationOnce((_ctx, fn) => fn(scopedTx));
    }

    it('getCurrent() returns schedulingWindowState "not_open" before the window opens, with no attempt created', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockInvitationWithExam(tx, notYetOpenExam);

      const result = await service.getCurrent(session);

      expect(result).toEqual({
        exam: {
          title: notYetOpenExam.title, instructions: notYetOpenExam.instructions, durationMinutes: notYetOpenExam.durationMinutes,
          schedulingEnabled: true,
          availabilityWindowStart: notYetOpenExam.availabilityWindowStart,
          availabilityWindowEnd: notYetOpenExam.availabilityWindowEnd,
        },
        schedulingWindowState: 'not_open',
        sections: [],
      });
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('getCurrent() returns schedulingWindowState "closed" after the window has passed, with no attempt created', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockInvitationWithExam(tx, closedExam);

      const result = await service.getCurrent(session);

      expect(result).toEqual(expect.objectContaining({ schedulingWindowState: 'closed', sections: [] }));
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('getCurrent() returns schedulingWindowState "open" within the window', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockInvitationWithExam(tx, openExam);

      const result = await service.getCurrent(session);

      expect(result).toEqual(expect.objectContaining({ schedulingWindowState: 'open', sections: [] }));
    });

    it('getCurrent() returns schedulingWindowState null for a non-scheduled exam', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toEqual(expect.objectContaining({ schedulingWindowState: null, sections: [] }));
    });

    it('start() rejects with "not open yet" before the window opens', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } };
      mockInvitationWithExam(tx, notYetOpenExam);

      await expect(service.start(session, { consent: true })).rejects.toThrow(
        'This exam is not open yet — check back during its scheduled window.',
      );
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('start() rejects with "closed" after the window has passed', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } };
      mockInvitationWithExam(tx, closedExam);

      await expect(service.start(session, { consent: true })).rejects.toThrow("This exam's availability window has closed.");
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('start() succeeds within the window', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockInvitationWithExam(tx, openExam);

      const result = await service.start(session, { consent: true });

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
    });

    it('start() returns an existing attempt idempotently even when the window is closed', async () => {
      const existing = { id: 'attempt-1', status: 'in_progress' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
      mockInvitationWithExam(tx, closedExam);

      const result = await service.start(session, {});

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });
  });

  describe('answer', () => {
    const attempt = { id: 'attempt-1', status: 'in_progress', startedAt: new Date(), questionOrderJson: JSON.stringify(['q1']) };
    const question = { id: 'q1', type: 'single_mcq', options: [{ id: 'opt-a' }, { id: 'opt-b' }] };

    it('upserts a valid answer', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      const result = await service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a'] });

      expect(result).toEqual({ questionId: 'q1', selectedOptionIds: ['opt-a'], answerText: null, isMarkedForReview: false });
      expect(tx.answer.upsert).toHaveBeenCalledWith({
        where: { attemptId_questionId: { attemptId: 'attempt-1', questionId: 'q1' } },
        create: { attemptId: 'attempt-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isMarkedForReview: false },
        update: { selectedOptionIdsJson: JSON.stringify(['opt-a']), isMarkedForReview: false, answeredAt: expect.any(Date) },
      });
    });

    it('allows marking for review with an empty selection and persists it', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      const result = await service.answer(session, { questionId: 'q1', selectedOptionIds: [], markedForReview: true });

      expect(result).toEqual({ questionId: 'q1', selectedOptionIds: [], answerText: null, isMarkedForReview: true });
      expect(tx.answer.upsert).toHaveBeenCalledWith({
        where: { attemptId_questionId: { attemptId: 'attempt-1', questionId: 'q1' } },
        create: { attemptId: 'attempt-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify([]), isMarkedForReview: true },
        update: { selectedOptionIdsJson: JSON.stringify([]), isMarkedForReview: true, answeredAt: expect.any(Date) },
      });
    });

    it('still rejects a non-empty selection containing an option id that does not belong to the question', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      await expect(service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-does-not-exist'] })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a question not part of this attempt', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      await expect(service.answer(session, { questionId: 'not-in-attempt', selectedOptionIds: ['opt-a'] })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a single_mcq answer selects more than one option', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      await expect(service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a', 'opt-b'] })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the attempt is not in_progress', async () => {
      const submittedAttempt = { ...attempt, status: 'submitted' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(submittedAttempt) } };
      settlement.settleIfExpired.mockResolvedValue(submittedAttempt);
      mockBootstrapThenScoped(tx);

      await expect(service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a'] })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when no attempt has been started', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenScoped(tx);

      await expect(service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a'] })).rejects.toThrow(NotFoundException);
    });

    it('resolves tenant context via an unscoped bootstrap lookup followed by a properly scoped call', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      await service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a'] });

      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        1,
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        2,
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
    });

    it('stores answerText for a code question without validating it against options', async () => {
      const codeAttempt = { ...attempt, questionOrderJson: JSON.stringify(['code-question-1']) };
      const codeQuestion = { id: 'code-question-1', type: 'code', options: [] };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(codeAttempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(codeQuestion) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(codeAttempt);
      mockBootstrapThenScoped(tx);

      const result = await service.answer(session, { questionId: 'code-question-1', selectedOptionIds: [], answerText: 'function reverse(s) { return s; }' });

      expect(result).toEqual({ questionId: 'code-question-1', selectedOptionIds: [], answerText: 'function reverse(s) { return s; }', isMarkedForReview: false });
      expect(tx.answer.upsert).toHaveBeenCalledWith({
        where: { attemptId_questionId: { attemptId: 'attempt-1', questionId: 'code-question-1' } },
        create: {
          attemptId: 'attempt-1',
          questionId: 'code-question-1',
          selectedOptionIdsJson: JSON.stringify([]),
          answerText: 'function reverse(s) { return s; }',
          isMarkedForReview: false,
        },
        update: {
          answerText: 'function reverse(s) { return s; }',
          isMarkedForReview: false,
          answeredAt: expect.any(Date),
        },
      });
    });

    it('persists telemetryJson on the code-question upsert when telemetry is provided', async () => {
      const codeAttempt = { ...attempt, questionOrderJson: JSON.stringify(['code-question-1']) };
      const codeQuestion = { id: 'code-question-1', type: 'code', options: [] };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(codeAttempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(codeQuestion) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(codeAttempt);
      mockBootstrapThenScoped(tx);
      const telemetry = { keystrokeChars: 10, pastedChars: 500, pasteCount: 1, largestPasteChars: 500, secondsToFirstEdit: 5, activeSeconds: 60, runCount: 2 };

      await service.answer(session, { questionId: 'code-question-1', selectedOptionIds: [], answerText: 'print(1)', telemetry });

      expect(tx.answer.upsert).toHaveBeenCalledWith({
        where: { attemptId_questionId: { attemptId: 'attempt-1', questionId: 'code-question-1' } },
        create: {
          attemptId: 'attempt-1',
          questionId: 'code-question-1',
          selectedOptionIdsJson: JSON.stringify([]),
          answerText: 'print(1)',
          isMarkedForReview: false,
          telemetryJson: JSON.stringify(telemetry),
        },
        update: {
          answerText: 'print(1)',
          isMarkedForReview: false,
          answeredAt: expect.any(Date),
          telemetryJson: JSON.stringify(telemetry),
        },
      });
    });

    it('omits telemetryJson from the code-question upsert when telemetry is not provided', async () => {
      const codeAttempt = { ...attempt, questionOrderJson: JSON.stringify(['code-question-1']) };
      const codeQuestion = { id: 'code-question-1', type: 'code', options: [] };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(codeAttempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(codeQuestion) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(codeAttempt);
      mockBootstrapThenScoped(tx);

      await service.answer(session, { questionId: 'code-question-1', selectedOptionIds: [], answerText: 'print(1)' });

      expect(tx.answer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.not.objectContaining({ telemetryJson: expect.anything() }),
          update: expect.not.objectContaining({ telemetryJson: expect.anything() }),
        }),
      );
    });

    it('recomputes and broadcasts the leaderboard after an auto-gradable answer is saved', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);
      leaderboardService.computeRecruiterView.mockResolvedValue([{ rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 1 }]);

      await service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a'] });

      expect(leaderboardService.computeRecruiterView).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, 'exam-1');
      expect(monitoringGateway.emitLeaderboardUpdate).toHaveBeenCalledWith('exam-1', [
        { rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 1 },
      ]);
    });

    it('does not recompute the leaderboard when the answered question is a code question', async () => {
      const codeAttempt = { ...attempt, questionOrderJson: JSON.stringify(['code-question-1']) };
      const codeQuestion = { id: 'code-question-1', type: 'code', options: [] };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(codeAttempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(codeQuestion) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(codeAttempt);
      mockBootstrapThenScoped(tx);

      await service.answer(session, { questionId: 'code-question-1', selectedOptionIds: [], answerText: 'print("hi")' });

      expect(leaderboardService.computeRecruiterView).not.toHaveBeenCalled();
      expect(monitoringGateway.emitLeaderboardUpdate).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('finalizes an in-progress attempt as submitted', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', startedAt: new Date(), questionOrderJson: '[]' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.finalize.mockResolvedValue({ id: 'attempt-1', status: 'submitted' });
      mockBootstrapThenScoped(tx);

      const result = await service.submit(session);

      expect(result).toEqual({ status: 'submitted' });
      expect(settlement.finalize).toHaveBeenCalledWith(tx, exam, attempt, 'submitted');
    });

    it('is a no-op returning the existing status when the attempt is already submitted', async () => {
      const attempt = { id: 'attempt-1', status: 'submitted', startedAt: new Date(), questionOrderJson: '[]' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      const result = await service.submit(session);

      expect(result).toEqual({ status: 'submitted' });
      expect(settlement.finalize).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no attempt has been started', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenScoped(tx);

      await expect(service.submit(session)).rejects.toThrow(NotFoundException);
    });

    it('resolves tenant context via an unscoped bootstrap lookup followed by a properly scoped call', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', startedAt: new Date(), questionOrderJson: '[]' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.finalize.mockResolvedValue({ id: 'attempt-1', status: 'submitted' });
      mockBootstrapThenScoped(tx);

      await service.submit(session);

      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        1,
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        2,
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
    });
  });

  describe('reportProctoringEvent', () => {
    it('creates a proctoring event with server-computed severity', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium' }) } };
      mockBootstrapThenScoped(tx);

      const result = await service.reportProctoringEvent(session, { eventType: 'tab_switch' });

      expect(result).toEqual({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium' });
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', eventType: 'tab_switch', severity: getProctoringEventSeverity('tab_switch'), metadataJson: null },
      });
    });

    it('serializes optional metadata to JSON', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      mockBootstrapThenScoped(tx);

      await service.reportProctoringEvent(session, { eventType: 'idle_timeout', metadata: { idleSeconds: 45 } });

      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', eventType: 'idle_timeout', severity: 'low', metadataJson: JSON.stringify({ idleSeconds: 45 }) },
      });
    });

    it('throws NotFoundException when no attempt has been started', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenScoped(tx);

      await expect(service.reportProctoringEvent(session, { eventType: 'tab_switch' })).rejects.toThrow(NotFoundException);
    });

    it('resolves tenant context via an unscoped bootstrap lookup followed by a properly scoped call', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium' }) } };
      mockBootstrapThenScoped(tx);

      await service.reportProctoringEvent(session, { eventType: 'tab_switch' });

      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        1,
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        2,
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
    });

    it('emits proctoring:flag after creating the event', async () => {
      const createdEvent = { id: 'evt-1', eventType: 'tab_switch', severity: 'medium', occurredAt: new Date() };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue(createdEvent) } };
      mockBootstrapThenScoped(tx);

      await service.reportProctoringEvent(session, { eventType: 'tab_switch' });

      expect(monitoringGateway.emitProctoringFlag).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: 'cand-1', eventType: 'tab_switch', severity: 'medium', occurredAt: createdEvent.occurredAt,
      });
    });
  });

  describe('runCode', () => {
    const codeQuestion = { id: 'q-code-1', type: 'code', codeLanguage: 'python', allowStdin: false };

    function setupTx(overrides: Partial<{ status: string; questionOrderJson: string; question: typeof codeQuestion }> = {}) {
      const attempt = {
        id: 'attempt-1',
        status: overrides.status ?? 'in_progress',
        questionOrderJson: overrides.questionOrderJson ?? JSON.stringify(['q-code-1']),
      };
      return {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(overrides.question ?? codeQuestion) },
      };
    }

    it('runs code for a valid code question and returns the Piston result', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      pistonClient.execute.mockResolvedValue({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false });
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });

      const result = await service.runCode(session, { questionId: 'q-code-1', code: 'print("hi")' });

      expect(result).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false, runsRemaining: 29 });
      expect(pistonClient.execute).toHaveBeenCalledWith({ language: 'python', version: '3.10.0', code: 'print("hi")', stdin: undefined });
    });

    it('rejects a non-code question', async () => {
      const tx = setupTx({ question: { ...codeQuestion, type: 'single_mcq' } });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('ignores stdin when the question does not allow it', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      pistonClient.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, compileError: null, timedOut: false });
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });

      await service.runCode(session, { questionId: 'q-code-1', code: 'x', stdin: 'ignored' });

      expect(pistonClient.execute).toHaveBeenCalledWith(expect.objectContaining({ stdin: undefined }));
    });

    it('passes stdin through when the question allows it', async () => {
      const tx = setupTx({ question: { ...codeQuestion, allowStdin: true } });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      pistonClient.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, compileError: null, timedOut: false });
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });

      await service.runCode(session, { questionId: 'q-code-1', code: 'x', stdin: 'Alice' });

      expect(pistonClient.execute).toHaveBeenCalledWith(expect.objectContaining({ stdin: 'Alice' }));
    });

    it('rejects with 429 once the run cap is exceeded', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: false, remaining: 0 });

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x' })).rejects.toMatchObject({ status: 429 });
      expect(pistonClient.execute).not.toHaveBeenCalled();
    });

    it('rejects when the attempt is not in progress', async () => {
      const tx = setupTx({ status: 'submitted' });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'submitted', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('translates a Piston failure into a 502 sandbox_unavailable error', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });
      pistonClient.execute.mockRejectedValue(new Error('network error'));

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x' })).rejects.toMatchObject({ status: 502 });
    });
  });

  describe('webcamViolation', () => {
    it('throws BadRequestException when the attempt is not in_progress', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'blocked' }) } };
      mockBootstrapThenScoped(tx);

      await expect(service.webcamViolation(session, { reason: 'no_face', snapshot: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('delegates to AttemptSettlementService.registerWebcamViolation and returns strike/status', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', webcamViolationCount: 0 };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      mockBootstrapThenScoped(tx);
      settlement.registerWebcamViolation = jest.fn().mockResolvedValue({ attempt: { ...attempt, status: 'paused', webcamViolationCount: 1 }, strike: 1 });

      const result = await service.webcamViolation(session, { reason: 'no_face', snapshot: 'x' });

      expect(result).toEqual({ strike: 1, status: 'paused' });
      expect(settlement.registerWebcamViolation).toHaveBeenCalledWith(tx, attempt, 'no_face', 'x');
    });
  });

  describe('getLeaderboard', () => {
    it('delegates to LeaderboardService.computeCandidateView with the resolved organizationId, exam id, and invitation id', async () => {
      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(invitationRecord));
      leaderboardService.computeCandidateView.mockResolvedValue({
        you: { rank: 5, correctCount: 3 },
        top: [{ rank: 1, correctCount: 4, label: 'Candidate 1', isYou: false }],
      });

      const result = await service.getLeaderboard(session);

      expect(leaderboardService.computeCandidateView).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        'exam-1',
        'inv-1',
      );
      expect(result).toEqual({
        you: { rank: 5, correctCount: 3 },
        top: [{ rank: 1, correctCount: 4, label: 'Candidate 1', isYou: false }],
      });
    });
  });

  describe('webcamResume', () => {
    it('throws BadRequestException when the attempt is not paused', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'blocked' }) } };
      mockBootstrapThenScoped(tx);

      await expect(service.webcamResume(session)).rejects.toThrow(BadRequestException);
    });

    it('delegates to AttemptSettlementService.resumeFromPause and returns the new status', async () => {
      const attempt = { id: 'attempt-1', status: 'paused' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      mockBootstrapThenScoped(tx);
      settlement.resumeFromPause = jest.fn().mockResolvedValue({ ...attempt, status: 'in_progress' });

      const result = await service.webcamResume(session);

      expect(result).toEqual({ status: 'in_progress' });
      expect(settlement.resumeFromPause).toHaveBeenCalledWith(tx, attempt);
    });
  });
});
