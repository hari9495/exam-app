import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AttemptService } from './attempt.service';
import { TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { getProctoringEventSeverity } from './proctoring-severity';
import { PistonClient } from '../code-execution/piston-client';
import { PistonRuntimesService } from '../code-execution/piston-runtimes.service';
import { RunLimiter } from '../code-execution/run-limiter';

describe('AttemptService', () => {
  let service: AttemptService;
  let tenantPrisma: { forTenant: jest.Mock };
  let settlement: {
    settleIfExpired: jest.Mock;
    finalize: jest.Mock;
    remainingSeconds: jest.Mock;
    registerWebcamViolation: jest.Mock;
    registerBrowserActivityViolation: jest.Mock;
    resumeFromPause: jest.Mock;
  };
  let monitoringGateway: { emitAttemptStatus: jest.Mock; emitProctoringFlag: jest.Mock; emitLeaderboardUpdate: jest.Mock };
  let pistonClient: { execute: jest.Mock };
  let pistonRuntimes: { getAvailableLanguages: jest.Mock; resolveLanguage: jest.Mock };
  let runLimiter: { checkAndIncrement: jest.Mock };
  let leaderboardService: { computeRecruiterView: jest.Mock; computeCandidateView: jest.Mock };
  let audit: { record: jest.Mock };
  let blobStorage: { upload: jest.Mock; uploadDataUri: jest.Mock };
  const session = { invitationId: 'inv-1' };
  const exam = {
    id: 'exam-1', organizationId: 'org-1', title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60, passCriteriaPercent: 40, randomizeOrder: false,
    schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null, feedbackVisibility: 'breakdown',
    webcamProctoringEnabled: true,
    proctoringEnforcement: 'block',
    proctoringStrikeLimit: 3,
    disabledProctoringSignalsJson: null,
  };
  const invitationRecord = { id: 'inv-1', candidateId: 'cand-1', examId: 'exam-1', exam, extraTimePercent: 0, candidate: { name: 'Ada Lovelace' } };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    settlement = {
      settleIfExpired: jest.fn(),
      finalize: jest.fn(),
      remainingSeconds: jest.fn(),
      registerWebcamViolation: jest.fn(),
      registerBrowserActivityViolation: jest.fn(),
      resumeFromPause: jest.fn(),
    };
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitProctoringFlag: jest.fn(), emitLeaderboardUpdate: jest.fn() };
    pistonClient = { execute: jest.fn() };
    pistonRuntimes = { getAvailableLanguages: jest.fn(), resolveLanguage: jest.fn() };
    runLimiter = { checkAndIncrement: jest.fn() };
    leaderboardService = { computeRecruiterView: jest.fn(), computeCandidateView: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    blobStorage = { upload: jest.fn(), uploadDataUri: jest.fn().mockImplementation((path, dataUri) => Promise.resolve(`https://blob.test/${path}`)) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: settlement },
        { provide: MonitoringGateway, useValue: monitoringGateway },
        { provide: PistonClient, useValue: pistonClient },
        { provide: PistonRuntimesService, useValue: pistonRuntimes },
        { provide: RunLimiter, useValue: runLimiter },
        { provide: LeaderboardService, useValue: leaderboardService },
        { provide: AuditService, useValue: audit },
        { provide: BlobStorageService, useValue: blobStorage },
      ],
    }).compile();
    service = moduleRef.get(AttemptService);
  });

  function mockBootstrapThenScoped(scopedTx: unknown) {
    tenantPrisma.forTenant
      .mockImplementationOnce(() => Promise.resolve(invitationRecord))
      .mockImplementationOnce((_ctx, fn) => fn(scopedTx));
  }

  // getCurrent additionally looks up the org's logo (for candidate-facing branding) via a
  // third bootstrap-scoped forTenant call, sandwiched between the invitation lookup and the
  // scoped attempt-data call that the other methods' mockBootstrapThenScoped doesn't need.
  function mockBootstrapWithLogoThenScoped(scopedTx: unknown, logoPath: string | null = null) {
    tenantPrisma.forTenant
      .mockImplementationOnce(() => Promise.resolve(invitationRecord))
      .mockImplementationOnce(() => Promise.resolve({ logoPath }))
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
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toEqual({
        candidateName: 'Ada Lovelace',
        exam: {
          title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60,
          schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null,
          proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
        },
        schedulingWindowState: null,
        sections: [
          { title: 'Section One', questionCount: 2 },
          { title: 'Section Two', questionCount: 5 },
        ],
        organizationLogoUrl: null,
        organizationPrimaryColor: null,
      });
    });

    it('returns the organization primaryColor alongside the logo when the org has one set', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null) },
        examSection: { findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(invitationRecord))
        .mockImplementationOnce(() => Promise.resolve({ logoPath: null, primaryColor: '#B23B3B' }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect((result as any).organizationPrimaryColor).toBe('#B23B3B');
    });

    it('returns browserActivityViolationCount alongside webcamViolationCount for an in-progress attempt', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
        webcamViolationCount: 1,
        browserActivityViolationCount: 2,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, languageMode: 'fixed', allowedLanguages: null, starterCode: null, allowStdin: false, snippetCode: null, snippetLanguage: null, imageUrl: null, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(1000);
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).webcamViolationCount).toBe(1);
      expect((result as any).browserActivityViolationCount).toBe(2);
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
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result.sections).toEqual([{ title: 'Section One', questionCount: 0 }]);
    });

    it('returns the effective duration (exam duration + extraTimePercent) when the invitation has an accommodation', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, extraTimePercent: 50 }))
        .mockImplementationOnce(() => Promise.resolve({ logoPath: null }))
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
            {
              id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5,
              languageMode: 'fixed', allowedLanguages: null,
              starterCode: null, allowStdin: false, snippetCode: null, snippetLanguage: null, imageUrl: null,
              options: [{ id: 'opt-a', text: '4', imageUrl: null }, { id: 'opt-b', text: '5', imageUrl: null }],
            },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isMarkedForReview: false }]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toEqual({
        candidateName: 'Ada Lovelace',
        status: 'in_progress',
        remainingSeconds: 3300,
        exam: { title: 'Backend Round', proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
        sections: [
          {
            title: 'Section One', targetDurationMinutes: 20,
            questions: [{
              id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5,
              languageMode: 'fixed', allowedLanguages: [],
              starterCode: null, allowStdin: false, snippetCode: null, snippetLanguage: null, imageUrl: null,
              options: [{ id: 'opt-a', text: '4', imageUrl: null }, { id: 'opt-b', text: '5', imageUrl: null }],
            }],
          },
        ],
        answers: [{ questionId: 'q1', selectedOptionIds: ['opt-a'], isMarkedForReview: false }],
        messages: [],
        feedback: null,
        organizationLogoUrl: null,
        organizationPrimaryColor: null,
      });
      expect((result as any).sections[0].questions[0]).not.toHaveProperty('isCorrect');
    });

    it('includes languageMode and allowedLanguages for a code question so the candidate can pick a language', async () => {
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
            {
              id: 'code-q1', text: 'Reverse a string', type: 'code', marks: 10,
              languageMode: 'fixed', allowedLanguages: JSON.stringify(['python', 'java']),
              starterCode: 'def reverse(s):\n    pass', allowStdin: true,
              snippetCode: null, snippetLanguage: null, imageUrl: null,
              options: [],
            },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).sections[0].questions[0]).toEqual({
        id: 'code-q1', text: 'Reverse a string', type: 'code', marks: 10,
        languageMode: 'fixed', allowedLanguages: ['python', 'java'],
        starterCode: 'def reverse(s):\n    pass', allowStdin: true,
        snippetCode: null, snippetLanguage: null, imageUrl: null,
        options: [],
      });
    });

    it('reports an empty allowedLanguages array for an any-mode code question', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['code-q2']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['code-q2'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'code-q2', text: 'Solve in any language', type: 'code', marks: 15,
              languageMode: 'any', allowedLanguages: null,
              starterCode: null, allowStdin: false,
              snippetCode: null, snippetLanguage: null, imageUrl: null,
              options: [],
            },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).sections[0].questions[0].languageMode).toBe('any');
      expect((result as any).sections[0].questions[0].allowedLanguages).toEqual([]);
    });

    it('includes snippetCode, snippetLanguage, and imageUrl (question + option) for an mcq question', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['mcq-q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['mcq-q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'mcq-q1', text: 'What does this code print?', type: 'single_mcq', marks: 5,
              languageMode: 'fixed', allowedLanguages: null, starterCode: null, allowStdin: false,
              snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])', snippetLanguage: 'python', imageUrl: 'http://localhost:3001/uploads/question-images/stem.png',
              options: [
                { id: 'opt-a', text: '[3, 2, 1]', imageUrl: 'http://localhost:3001/uploads/question-images/opt-a.png' },
                { id: 'opt-b', text: '[1, 2, 3]', imageUrl: null },
              ],
            },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).sections[0].questions[0]).toEqual({
        id: 'mcq-q1', text: 'What does this code print?', type: 'single_mcq', marks: 5,
        languageMode: 'fixed', allowedLanguages: [], starterCode: null, allowStdin: false,
        snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])', snippetLanguage: 'python', imageUrl: 'http://localhost:3001/uploads/question-images/stem.png',
        options: [
          { id: 'opt-a', text: '[3, 2, 1]', imageUrl: 'http://localhost:3001/uploads/question-images/opt-a.png' },
          { id: 'opt-b', text: '[1, 2, 3]', imageUrl: null },
        ],
      });
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
      mockBootstrapWithLogoThenScoped(tx);

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
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).messages).toEqual([{ id: 'msg-1', body: 'Please stay on the exam tab', sentAt: unreadMessage.sentAt }]);
      expect(tx.candidateMessage.findMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1', readAt: null } });
      expect(tx.candidateMessage.updateMany).toHaveBeenCalledWith({
        where: { attemptId: 'attempt-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('resolves tenant context via an unscoped bootstrap lookup, an unscoped logo lookup, then a properly scoped call', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockBootstrapWithLogoThenScoped(tx);

      await service.getCurrent(session);

      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        1,
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        2,
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        3,
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
      mockBootstrapWithLogoThenScoped(tx);

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
      mockBootstrapWithLogoThenScoped(tx);

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
        .mockImplementationOnce(() => Promise.resolve({ logoPath: null }))
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
        .mockImplementationOnce(() => Promise.resolve({ logoPath: null }))
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
        .mockImplementationOnce(() => Promise.resolve({ logoPath: null }))
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
        .mockImplementationOnce(() => Promise.resolve({ logoPath: null }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect((result as any).feedback).toEqual({
        status: 'settled', visibility: 'breakdown', passFail: 'fail', percentage: 50,
        sections: [{ title: 'Section One', score: 5, maxScore: 10 }],
      });
    });

    it('includes the resolved proctoring config in the pre-start preview, because the welcome screen gates the camera prompt on it', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect('schedulingWindowState' in result).toBe(true);
      expect((result as { exam: { proctoring: unknown } }).exam.proctoring).toEqual({
        webcamEnabled: true,
        enforcement: 'block',
        strikeLimit: 3,
        disabledSignals: [],
      });
    });

    it('includes the resolved proctoring config in the in-exam state so the client can stop emitting disabled signals', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: '[]', sectionSnapshotJson: '[]', optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as { exam: { title: string; proctoring: unknown } }).exam).toEqual({
        title: expect.any(String),
        proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
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

  describe('start IP restriction', () => {
    function mockRestrictedInvitation(allowedIpRange: string | null) {
      tenantPrisma.forTenant.mockImplementationOnce(() =>
        Promise.resolve({ ...invitationRecord, exam: { ...exam, allowedIpRange } }),
      );
    }

    it('blocks redeem from a disallowed IP with the observed IP in the message, and audit-logs it', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } };
      mockRestrictedInvitation('203.0.113.0/24');
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(tx));

      await expect(service.start(session, { consent: true }, '198.51.100.7')).rejects.toThrow(
        'Your network (198.51.100.7) is not approved for this exam. Please contact the exam organizer.',
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: expect.any(String) }),
        expect.objectContaining({
          action: 'attempt.blocked_ip',
          entityType: 'invitation',
          entityId: 'inv-1',
          metadata: expect.objectContaining({ observedIp: '198.51.100.7', allowedIpRange: '203.0.113.0/24', phase: 'start' }),
        }),
      );
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('allows start from an IP inside the range', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: { findMany: jest.fn().mockResolvedValue([]) },
      };
      mockRestrictedInvitation('203.0.113.0/24');
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.start(session, { consent: true }, '203.0.113.50');

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('skips the check entirely when allowedIpRange is null', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: { findMany: jest.fn().mockResolvedValue([]) },
      };
      mockRestrictedInvitation(null);
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.start(session, { consent: true }, 'anything-goes');

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('fails closed when the stored range is malformed', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } };
      mockRestrictedInvitation('garbage');
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(tx));

      await expect(service.start(session, { consent: true }, '203.0.113.50')).rejects.toThrow(ForbiddenException);
      expect(audit.record).toHaveBeenCalled();
    });

    it('does not IP-check an already-existing attempt (idempotent resume path)', async () => {
      const existing = { id: 'attempt-1', status: 'in_progress' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
      mockRestrictedInvitation('203.0.113.0/24');
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.start(session, {}, '198.51.100.7');

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(audit.record).not.toHaveBeenCalled();
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

    // Shared by both getCurrent() tests (which look up the org logo) and start() tests (which
    // don't) - callers that need the logo call insert it themselves before calling this.
    function mockInvitationWithExam(scopedTx: unknown, scheduledExam: Record<string, unknown>) {
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: scheduledExam }))
        .mockImplementationOnce((_ctx, fn) => fn(scopedTx));
    }

    function mockInvitationWithExamAndLogo(scopedTx: unknown, scheduledExam: Record<string, unknown>) {
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: scheduledExam }))
        .mockImplementationOnce(() => Promise.resolve({ logoPath: null }))
        .mockImplementationOnce((_ctx, fn) => fn(scopedTx));
    }

    it('getCurrent() returns schedulingWindowState "not_open" before the window opens, with no attempt created', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockInvitationWithExamAndLogo(tx, notYetOpenExam);

      const result = await service.getCurrent(session);

      expect(result).toEqual({
        candidateName: 'Ada Lovelace',
        exam: {
          title: notYetOpenExam.title, instructions: notYetOpenExam.instructions, durationMinutes: notYetOpenExam.durationMinutes,
          schedulingEnabled: true,
          availabilityWindowStart: notYetOpenExam.availabilityWindowStart,
          availabilityWindowEnd: notYetOpenExam.availabilityWindowEnd,
          proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
        },
        schedulingWindowState: 'not_open',
        sections: [],
        organizationLogoUrl: null,
        organizationPrimaryColor: null,
      });
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('getCurrent() returns schedulingWindowState "closed" after the window has passed, with no attempt created', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockInvitationWithExamAndLogo(tx, closedExam);

      const result = await service.getCurrent(session);

      expect(result).toEqual(expect.objectContaining({ schedulingWindowState: 'closed', sections: [] }));
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('getCurrent() returns schedulingWindowState "open" within the window', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockInvitationWithExamAndLogo(tx, openExam);

      const result = await service.getCurrent(session);

      expect(result).toEqual(expect.objectContaining({ schedulingWindowState: 'open', sections: [] }));
    });

    it('getCurrent() returns schedulingWindowState null for a non-scheduled exam', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      mockBootstrapWithLogoThenScoped(tx);

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
          codeLanguage: null,
          isMarkedForReview: false,
        },
        update: {
          answerText: 'function reverse(s) { return s; }',
          codeLanguage: null,
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
          codeLanguage: null,
          isMarkedForReview: false,
          telemetryJson: JSON.stringify(telemetry),
        },
        update: {
          answerText: 'print(1)',
          codeLanguage: null,
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

    it('persists the candidate\'s chosen codeLanguage on a code answer', async () => {
      const codeAttempt = { ...attempt, questionOrderJson: JSON.stringify(['code-question-1']) };
      const codeQuestion = { id: 'code-question-1', type: 'code', options: [] };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(codeAttempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(codeQuestion) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(codeAttempt);
      mockBootstrapThenScoped(tx);

      const result = await service.answer(session, { questionId: 'code-question-1', selectedOptionIds: [], answerText: 'print(1)', codeLanguage: 'python' });

      expect(result.answerText).toBe('print(1)');
      expect(tx.answer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ codeLanguage: 'python' }),
          update: expect.objectContaining({ codeLanguage: 'python' }),
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
    describe('a non-strike-worthy event type (e.g. looking_down)', () => {
      it('creates a proctoring event with server-computed severity', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockBootstrapThenScoped(tx);

        const result = await service.reportProctoringEvent(session, { eventType: 'looking_down' });

        expect(result).toEqual({ id: 'evt-1', eventType: 'looking_down', severity: 'medium', strike: 0, status: 'in_progress' });
        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: getProctoringEventSeverity('looking_down'), metadataJson: null },
        });
        expect(settlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
      });

      it('serializes optional metadata to JSON', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        mockBootstrapThenScoped(tx);

        await service.reportProctoringEvent(session, { eventType: 'looking_down', metadata: { confidence: 0.8 } });

        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: JSON.stringify({ confidence: 0.8 }) },
        });
      });

      it('throws NotFoundException when no attempt has been started', async () => {
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
        mockBootstrapThenScoped(tx);

        await expect(service.reportProctoringEvent(session, { eventType: 'looking_down' })).rejects.toThrow(NotFoundException);
      });

      it('resolves tenant context via an unscoped bootstrap lookup followed by a properly scoped call', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockBootstrapThenScoped(tx);

        await service.reportProctoringEvent(session, { eventType: 'looking_down' });

        expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(1, { organizationId: null, isSuperAdmin: true }, expect.any(Function));
        expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(2, { organizationId: 'org-1', isSuperAdmin: false }, expect.any(Function));
      });

      it('emits proctoring:flag after creating the event', async () => {
        const createdEvent = { id: 'evt-1', eventType: 'looking_down', severity: 'medium', occurredAt: new Date() };
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue(createdEvent) },
        };
        mockBootstrapThenScoped(tx);

        await service.reportProctoringEvent(session, { eventType: 'looking_down' });

        expect(monitoringGateway.emitProctoringFlag).toHaveBeenCalledWith('exam-1', {
          attemptId: 'attempt-1', candidateId: 'cand-1', eventType: 'looking_down', severity: 'medium', occurredAt: createdEvent.occurredAt,
        });
      });
    });

    describe('a strike-worthy event type (e.g. tab_switch)', () => {
      it('delegates to registerBrowserActivityViolation and returns its strike/status', async () => {
        const attempt = { id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' };
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
        mockBootstrapThenScoped(tx);
        settlement.registerBrowserActivityViolation.mockResolvedValue({
          attempt: { ...attempt, browserActivityViolationCount: 1, status: 'paused' },
          strike: 1,
          event: { id: 'evt-1', eventType: 'tab_switch', severity: 'medium' },
        });

        const result = await service.reportProctoringEvent(session, { eventType: 'tab_switch' });

        expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(tx, attempt, 'tab_switch', undefined);
        expect(result).toEqual({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium', strike: 1, status: 'paused' });
      });

      it('passes optional metadata through to registerBrowserActivityViolation', async () => {
        const attempt = { id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' };
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
        mockBootstrapThenScoped(tx);
        settlement.registerBrowserActivityViolation.mockResolvedValue({
          attempt: { ...attempt, browserActivityViolationCount: 1, status: 'paused' },
          strike: 1,
          event: { id: 'evt-1', eventType: 'window_blur', severity: 'medium' },
        });

        await service.reportProctoringEvent(session, { eventType: 'window_blur', metadata: { durationMs: 3000 } });

        expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(tx, attempt, 'window_blur', { durationMs: 3000 });
      });

      it('emits proctoring:flag with the event returned by registerBrowserActivityViolation', async () => {
        const attempt = { id: 'attempt-1', browserActivityViolationCount: 2, status: 'in_progress' };
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
        mockBootstrapThenScoped(tx);
        settlement.registerBrowserActivityViolation.mockResolvedValue({
          attempt: { ...attempt, browserActivityViolationCount: 3, status: 'blocked' },
          strike: 3,
          event: { id: 'evt-1', eventType: 'dev_tools_detected', severity: 'high' },
        });

        await service.reportProctoringEvent(session, { eventType: 'dev_tools_detected' });

        expect(monitoringGateway.emitProctoringFlag).toHaveBeenCalledWith('exam-1', expect.objectContaining({
          attemptId: 'attempt-1', candidateId: 'cand-1', eventType: 'dev_tools_detected', severity: 'high',
        }));
      });

      it('throws NotFoundException when no attempt has been started', async () => {
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
        mockBootstrapThenScoped(tx);

        await expect(service.reportProctoringEvent(session, { eventType: 'tab_switch' })).rejects.toThrow(NotFoundException);
        expect(settlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
      });
    });

    describe('a signal disabled for the exam', () => {
      it('silently ignores a signal the exam has disabled -- no event row, no strike, no live flag', async () => {
        const examWithDisabledSignal = { ...exam, disabledProctoringSignalsJson: JSON.stringify(['right_click']) };
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 1, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn() },
        };
        tenantPrisma.forTenant
          .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examWithDisabledSignal }))
          .mockImplementationOnce((_ctx, fn) => fn(tx));

        const result = await service.reportProctoringEvent(session, { eventType: 'right_click' });

        expect(tx.proctoringEvent.create).not.toHaveBeenCalled();
        expect(settlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
        expect(monitoringGateway.emitProctoringFlag).not.toHaveBeenCalled();
        // Returns unchanged state rather than 400ing: a stale client tab must not be
        // able to fail an exam with errors after the recruiter turns a signal off.
        expect(result).toEqual({ id: '', eventType: 'right_click', severity: 'low', strike: 1, status: 'in_progress' });
      });

      it('still processes a signal that is not in the disabled list', async () => {
        const examWithDisabledSignal = { ...exam, disabledProctoringSignalsJson: JSON.stringify(['right_click']) };
        const attempt = { id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' };
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
        tenantPrisma.forTenant
          .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examWithDisabledSignal }))
          .mockImplementationOnce((_ctx, fn) => fn(tx));
        settlement.registerBrowserActivityViolation.mockResolvedValue({
          attempt: { ...attempt, browserActivityViolationCount: 1, status: 'paused' },
          strike: 1,
          event: { id: 'evt-1', eventType: 'tab_switch', severity: 'medium' },
        });

        await service.reportProctoringEvent(session, { eventType: 'tab_switch' });

        expect(settlement.registerBrowserActivityViolation).toHaveBeenCalled();
      });
    });
  });

  describe('runCode', () => {
    const codeQuestion = { id: 'q-code-1', type: 'code', languageMode: 'fixed', allowedLanguages: JSON.stringify(['python']), allowStdin: false };

    function setupTx(
      overrides: Partial<{
        status: string;
        questionOrderJson: string;
        question: { id: string; type: string; languageMode: string; allowedLanguages: string | null; allowStdin: boolean };
      }> = {},
    ) {
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
      pistonRuntimes.resolveLanguage.mockResolvedValue({ language: 'python', version: '3.10.0' });

      const result = await service.runCode(session, { questionId: 'q-code-1', code: 'print("hi")', codeLanguage: 'python' });

      expect(result).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false, runsRemaining: 29 });
      expect(pistonClient.execute).toHaveBeenCalledWith({ language: 'python', version: '3.10.0', code: 'print("hi")', stdin: undefined });
    });

    it('rejects a non-code question', async () => {
      const tx = setupTx({ question: { ...codeQuestion, type: 'single_mcq' } });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x', codeLanguage: 'python' })).rejects.toThrow(BadRequestException);
    });

    it('ignores stdin when the question does not allow it', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      pistonClient.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, compileError: null, timedOut: false });
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });
      pistonRuntimes.resolveLanguage.mockResolvedValue({ language: 'python', version: '3.10.0' });

      await service.runCode(session, { questionId: 'q-code-1', code: 'x', stdin: 'ignored', codeLanguage: 'python' });

      expect(pistonClient.execute).toHaveBeenCalledWith(expect.objectContaining({ stdin: undefined }));
    });

    it('passes stdin through when the question allows it', async () => {
      const tx = setupTx({ question: { ...codeQuestion, allowStdin: true } });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      pistonClient.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, compileError: null, timedOut: false });
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });
      pistonRuntimes.resolveLanguage.mockResolvedValue({ language: 'python', version: '3.10.0' });

      await service.runCode(session, { questionId: 'q-code-1', code: 'x', stdin: 'Alice', codeLanguage: 'python' });

      expect(pistonClient.execute).toHaveBeenCalledWith(expect.objectContaining({ stdin: 'Alice' }));
    });

    it('rejects with 429 once the run cap is exceeded', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: false, remaining: 0 });

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x', codeLanguage: 'python' })).rejects.toMatchObject({ status: 429 });
      expect(pistonClient.execute).not.toHaveBeenCalled();
    });

    it('rejects when the attempt is not in progress', async () => {
      const tx = setupTx({ status: 'submitted' });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'submitted', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x', codeLanguage: 'python' })).rejects.toThrow(BadRequestException);
    });

    it('translates a Piston failure into a 502 sandbox_unavailable error', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });
      pistonRuntimes.resolveLanguage.mockResolvedValue({ language: 'python', version: '3.10.0' });
      pistonClient.execute.mockRejectedValue(new Error('network error'));

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x', codeLanguage: 'python' })).rejects.toMatchObject({ status: 502 });
    });

    it('rejects a run with a language not in the question\'s allowedLanguages (fixed mode)', async () => {
      const tx = setupTx({ question: codeQuestion });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });

      await expect(
        service.runCode(session, { questionId: 'q-code-1', code: 'x', codeLanguage: 'ruby' }),
      ).rejects.toThrow('ruby is not an allowed language for this question');
    });

    it('resolves the language via PistonRuntimesService instead of a static map', async () => {
      const tx = setupTx({ question: codeQuestion });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });
      pistonRuntimes.resolveLanguage.mockResolvedValue({ language: 'python', version: '3.10.0' });
      pistonClient.execute.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0, compileError: null, timedOut: false });

      await service.runCode(session, { questionId: 'q-code-1', code: 'print(1)', codeLanguage: 'python' });

      expect(pistonRuntimes.resolveLanguage).toHaveBeenCalledWith('python');
      expect(pistonClient.execute).toHaveBeenCalledWith(expect.objectContaining({ language: 'python', version: '3.10.0' }));
    });

    it('allows any language for an any-mode question as long as Piston resolves it', async () => {
      const anyModeQuestion = { id: 'q-code-2', type: 'code', languageMode: 'any', allowedLanguages: null, allowStdin: false };
      const tx = setupTx({ question: anyModeQuestion });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-2']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });
      pistonRuntimes.resolveLanguage.mockResolvedValue({ language: 'rust', version: '1.68.0' });
      pistonClient.execute.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0, compileError: null, timedOut: false });

      const result = await service.runCode(session, { questionId: 'q-code-2', code: 'fn main() {}', codeLanguage: 'rust' });

      expect(result.stdout).toBe('ok');
    });
  });

  describe('getCodeLanguages', () => {
    it('returns the live Piston language list', async () => {
      pistonRuntimes.getAvailableLanguages.mockResolvedValue([{ language: 'python', version: '3.10.0' }]);

      const result = await service.getCodeLanguages();

      expect(result).toEqual({ languages: [{ language: 'python', version: '3.10.0' }] });
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
      expect(blobStorage.uploadDataUri).toHaveBeenCalledWith(expect.stringContaining('webcam-snapshots/attempt-1-'), 'x');
      const uploadedUrl = await blobStorage.uploadDataUri.mock.results[0].value;
      expect(settlement.registerWebcamViolation).toHaveBeenCalledWith(tx, attempt, 'no_face', uploadedUrl);
    });
  });

  describe('webcamSnapshot', () => {
    it('stores a low-severity webcam_snapshot event and does not emit a live flag', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      mockBootstrapThenScoped(tx);

      const result = await service.webcamSnapshot(session, { snapshot: 'data:image/jpeg;base64,abc' });

      expect(result).toEqual({ ok: true });
      expect(blobStorage.uploadDataUri).toHaveBeenCalledWith(expect.stringContaining('webcam-snapshots/attempt-1-'), 'data:image/jpeg;base64,abc');
      const created = tx.proctoringEvent.create.mock.calls[0][0];
      expect(created.data.attemptId).toBe('attempt-1');
      expect(created.data.eventType).toBe('webcam_snapshot');
      expect(created.data.severity).toBe('low');
      expect(JSON.parse(created.data.metadataJson).snapshot).toMatch(/^https:\/\/blob\.test\/webcam-snapshots\/attempt-1-/);
      expect(monitoringGateway.emitProctoringFlag).not.toHaveBeenCalled();
    });
  });

  describe('getLeaderboard', () => {
    it('delegates to LeaderboardService.computeCandidateView while the attempt is in_progress, regardless of feedbackVisibility', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: { ...exam, feedbackVisibility: 'none' } }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));
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

    it('delegates to LeaderboardService.computeCandidateView when no attempt exists yet (pre-start)', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: { ...exam, feedbackVisibility: 'none' } }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));
      leaderboardService.computeCandidateView.mockResolvedValue({ you: null, top: [] });

      await service.getLeaderboard(session);

      expect(leaderboardService.computeCandidateView).toHaveBeenCalled();
    });

    it('blocks leaderboard data once submitted when feedbackVisibility is none', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: { ...exam, feedbackVisibility: 'none' } }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getLeaderboard(session);

      expect(result).toEqual({ you: null, top: [] });
      expect(leaderboardService.computeCandidateView).not.toHaveBeenCalled();
    });

    it('blocks leaderboard data once pending_manual_grade when feedbackVisibility is pass_fail', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'pending_manual_grade' }) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: { ...exam, feedbackVisibility: 'pass_fail' } }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getLeaderboard(session);

      expect(result).toEqual({ you: null, top: [] });
      expect(leaderboardService.computeCandidateView).not.toHaveBeenCalled();
    });

    it('still returns leaderboard data after submission when feedbackVisibility is score', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'auto_submitted' }) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: { ...exam, feedbackVisibility: 'score' } }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));
      leaderboardService.computeCandidateView.mockResolvedValue({
        you: { rank: 2, correctCount: 8 },
        top: [],
      });

      const result = await service.getLeaderboard(session);

      expect(leaderboardService.computeCandidateView).toHaveBeenCalled();
      expect(result).toEqual({ you: { rank: 2, correctCount: 8 }, top: [] });
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
