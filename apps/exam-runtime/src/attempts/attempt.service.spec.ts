import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AttemptService } from './attempt.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { getProctoringEventSeverity } from './proctoring-severity';

describe('AttemptService', () => {
  let service: AttemptService;
  let tenantPrisma: { forTenant: jest.Mock };
  let settlement: { settleIfExpired: jest.Mock; finalize: jest.Mock; remainingSeconds: jest.Mock };
  let monitoringGateway: { emitAttemptStatus: jest.Mock; emitProctoringFlag: jest.Mock };
  const session = { invitationId: 'inv-1' };
  const exam = { id: 'exam-1', organizationId: 'org-1', title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60, passCriteriaPercent: 40, randomizeOrder: false };
  const invitationRecord = { id: 'inv-1', candidateId: 'cand-1', examId: 'exam-1', exam };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    settlement = { settleIfExpired: jest.fn(), finalize: jest.fn(), remainingSeconds: jest.fn() };
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitProctoringFlag: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: settlement },
        { provide: MonitoringGateway, useValue: monitoringGateway },
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

    it('returns an exam preview with no questions when no attempt has been started yet', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toEqual({ exam: { title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60 } });
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
        sections: [
          { title: 'Section One', targetDurationMinutes: 20, questions: [{ id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] }] },
        ],
        answers: [{ questionId: 'q1', selectedOptionIds: ['opt-a'], isMarkedForReview: false }],
        messages: [],
      });
      expect((result as any).sections[0].questions[0]).not.toHaveProperty('isCorrect');
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
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
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

      const result = await service.start(session);

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(tx.attempt.create).toHaveBeenCalledWith({
        data: {
          invitationId: 'inv-1', candidateId: 'cand-1', examId: 'exam-1',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1', 'q2'] }]),
          optionOrderJson: null,
          deviceFingerprint: undefined,
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

      await service.start(session, { deviceFingerprint: 'fp-abc123' });

      expect(tx.attempt.create).toHaveBeenCalledWith({
        data: {
          invitationId: 'inv-1', candidateId: 'cand-1', examId: 'exam-1',
          questionOrderJson: JSON.stringify(['q1']),
          sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
          optionOrderJson: null,
          deviceFingerprint: 'fp-abc123',
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

      await service.start(session);

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

      await service.start(session);

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

      await service.start(session);

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

      await service.start(session);

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

      await service.start(session);

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

      await service.start(session);

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

      await service.start(session);

      const createdData = tx.attempt.create.mock.calls[0][0].data;
      expect(createdData.optionOrderJson).toBeNull();
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
});
