import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AttemptService } from './attempt.service';
import {
  TenantPrismaService,
  AuditService,
  BlobStorageService,
  AiApiKeyResolverService,
  SystemEventsService,
  OrgSecretsCryptoService,
  POOL_EXHAUSTED_RESPONSE,
  buildSebConfig,
  requestConfigKeyHash,
} from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { getProctoringEventSeverity } from './proctoring-severity';
import { PistonClient } from '../code-execution/piston-client';
import { PistonRuntimesService } from '../code-execution/piston-runtimes.service';
import { RunLimiter } from '../code-execution/run-limiter';
import { FaceEmbedderService } from '../face/face-embedder.service';
import { FaceVerificationService } from '../face/face-verification.service';

// The cap-count query folds case AND width (see sanitize-metadata.ts / scc-task-5-report.md),
// so a plain `.toContain('"screenshot":')` assertion is case- and width-sensitive in JS and
// would pass on a stored `"ｓcreenshot":` that the real query still matches. Fold the same way
// production does before asserting, so a passing test means what it looks like it means.
function foldForCapCheck(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

// Finding 2 (task-8): tenantPrisma.forTenant's default fallback implementation (see beforeEach)
// invokes its callback with one of these instead of returning undefined without calling it.
// Every property resolves to a fresh stub table with the handful of Prisma methods this file's
// code actually calls on a tx, each defaulting to an empty/absent result -- generic and inert on
// purpose, so a test that doesn't care about a particular forTenant call still gets *something*
// callable back rather than a thrown "Cannot read properties of undefined".
function defaultTx(): unknown {
  const stubTable = () => ({
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findUniqueOrThrow: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
  });
  return new Proxy({}, { get: () => stubTable() });
}

describe('AttemptService', () => {
  let service: AttemptService;
  let tenantPrisma: { forTenant: jest.Mock; withoutTenantScope: jest.Mock };
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
  let blobStorage: { upload: jest.Mock; uploadDataUri: jest.Mock; signIfOurs: jest.Mock };
  let aiApiKeyResolver: { resolve: jest.Mock };
  let generateStructured: jest.Mock;
  let systemEvents: { record: jest.Mock };
  let faceEmbedder: { embed: jest.Mock; isAvailable: jest.Mock };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  let faceVerification: { verifySnapshot: jest.Mock; forgetAttempt: jest.Mock };
  const session = { invitationId: 'inv-1' };
  const exam = {
    id: 'exam-1', organizationId: 'org-1', title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60, passCriteriaPercent: 40, randomizeOrder: false,
    schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null, feedbackVisibility: 'breakdown',
    enableAntiCheating: true,
    webcamProctoringEnabled: true,
    proctoringEnforcement: 'block',
    proctoringStrikeLimit: 3,
    disabledProctoringSignalsJson: null,
  };
  const invitationRecord = { id: 'inv-1', candidateId: 'cand-1', examId: 'exam-1', exam, extraTimePercent: 0, candidate: { name: 'Ada Lovelace' } };

  beforeEach(async () => {
    // Finding 2 (task-8): a bare `jest.fn()` never invokes its callback, so a stage-3 developer
    // who writes the natural `forTenant(ctx, tx => registerWebcamViolation(tx, …))` gets `tx`
    // as `undefined` and the callback never runs at all -- the whole suite stays green even
    // though real enforcement would follow. Give it a default that actually calls back with a
    // generic stub transaction, so wrapping a mock method in forTenant is exercised the same way
    // production would exercise it. Individual tests still layer `.mockImplementationOnce(...)`
    // on top for the specific tx/return value their assertions need; this default only fires for
    // calls a test doesn't explicitly stub.
    tenantPrisma = { forTenant: jest.fn((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(defaultTx())), withoutTenantScope: jest.fn() };
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
    blobStorage = {
      // Same `https://blob.test/${path}` shape as uploadDataUri below -- webcamSnapshot's
      // pre-decoded upload path (finding 7) calls this directly instead of uploadDataUri when the
      // snapshot's content type is supported, so tests asserting on the returned URL work the same
      // regardless of which of the two the code under test happens to route through.
      upload: jest.fn().mockImplementation((path) => Promise.resolve(`https://blob.test/${path}`)),
      uploadDataUri: jest.fn().mockImplementation((path, dataUri) => Promise.resolve(`https://blob.test/${path}`)),
      signIfOurs: jest.fn(async (value: unknown) => value),
    };
    generateStructured = jest.fn();
    aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue({ generateStructured, ping: jest.fn() }) };
    systemEvents = { record: jest.fn().mockResolvedValue(undefined) };
    faceEmbedder = { embed: jest.fn().mockResolvedValue(null), isAvailable: jest.fn().mockReturnValue(false) };
    crypto = { encrypt: jest.fn((plain: string) => `enc(${plain})`), decrypt: jest.fn() };
    faceVerification = {
      verifySnapshot: jest.fn().mockResolvedValue({ verdict: 'skipped', score: null, confirmed: false }),
      forgetAttempt: jest.fn(),
    };

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
        { provide: AiApiKeyResolverService, useValue: aiApiKeyResolver },
        { provide: SystemEventsService, useValue: systemEvents },
        { provide: FaceEmbedderService, useValue: faceEmbedder },
        { provide: OrgSecretsCryptoService, useValue: crypto },
        { provide: FaceVerificationService, useValue: faceVerification },
      ],
    }).compile();
    service = moduleRef.get(AttemptService);
  });

  function mockBootstrapThenScoped(scopedTx: unknown) {
    tenantPrisma.forTenant
      .mockImplementationOnce(() => Promise.resolve(invitationRecord))
      .mockImplementationOnce((_ctx, fn) => fn(scopedTx));
  }

  // reportProctoringEvent and webcamViolation split their work across two separate scoped
  // forTenant calls when a screenshot actually needs uploading (decide -- upload with no
  // transaction open -- commit; see ADO #6810). Both scoped calls operate on the same
  // underlying tx mock, exactly as two separate interactive transactions against the same
  // tenant would.
  function mockBootstrapThenTwoScopedCalls(scopedTx: unknown, invitation: unknown = invitationRecord) {
    tenantPrisma.forTenant
      .mockImplementationOnce(() => Promise.resolve(invitation))
      .mockImplementationOnce((_ctx, fn) => fn(scopedTx))
      .mockImplementationOnce((_ctx, fn) => fn(scopedTx));
  }

  // webcamSnapshot (ADO #6809): only resolveContext's invitation lookup still goes through
  // forTenant -- the attempt read and the event write run on the plain client via
  // withoutTenantScope instead, so both scoped calls just invoke fn against the same stub client.
  function mockBootstrapThenPlainClient(client: unknown, invitation: unknown = invitationRecord) {
    tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(invitation));
    tenantPrisma.withoutTenantScope.mockImplementation((fn: (client: unknown) => unknown) => fn(client));
  }

  // getCurrent additionally looks up the org's logo (for candidate-facing branding) via a
  // third bootstrap-scoped forTenant call, sandwiched between the invitation lookup and the
  // scoped attempt-data call that the other methods' mockBootstrapThenScoped doesn't need.
  function mockBootstrapWithLogoThenScoped(scopedTx: unknown, logoPath: string | null = null) {
    tenantPrisma.forTenant
      .mockImplementationOnce(() => Promise.resolve(invitationRecord))
      .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath }))
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
          proctoring: { enableAntiCheating: true, webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
        },
        schedulingWindowState: null,
        sections: [
          { title: 'Section One', questionCount: 2 },
          { title: 'Section Two', questionCount: 5 },
        ],
        organizationName: 'Acme Corp',
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
        .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null, primaryColor: '#B23B3B' }))
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

    it('exposes the server-authoritative pausedReason for a paused attempt, instead of leaving the client to guess from counters', async () => {
      const attempt = {
        id: 'attempt-1', status: 'paused', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
        webcamViolationCount: 0,
        browserActivityViolationCount: 1,
        pausedReason: 'browser_activity',
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

      expect((result as any).pausedReason).toBe('browser_activity');
    });

    it('reports enforcement "warn" for a bypassed attempt even when the exam is configured to block', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
        proctoringBypassedAt: new Date(),
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

      expect((result as any).exam.proctoring.enforcement).toBe('warn');
    });

    describe('screenShareRequired', () => {
      const attemptBase = {
        id: 'attempt-1', status: 'in_progress' as const, startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const txFor = (attempt: unknown) => ({
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q', type: 'single_mcq', marks: 5, languageMode: 'fixed', allowedLanguages: null, starterCode: null, allowStdin: false, snippetCode: null, snippetLanguage: null, imageUrl: null, options: [] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      });

      it('is true when the exam has screenCaptureEnabled and there is no bypass', async () => {
        const examWithCapture = { ...exam, screenCaptureEnabled: true };
        const attempt = { ...attemptBase, proctoringBypassedAt: null, proctoringBypassRevokedAt: null };
        tenantPrisma.forTenant
          .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examWithCapture }))
          .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
          .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(txFor(attempt)));
        settlement.settleIfExpired.mockResolvedValue(attempt);
        settlement.remainingSeconds.mockReturnValue(1000);

        const result = await service.getCurrent(session);

        expect((result as any).screenShareRequired).toBe(true);
      });

      it('is false when the exam has screenCaptureEnabled off', async () => {
        const examWithoutCapture = { ...exam, screenCaptureEnabled: false };
        const attempt = { ...attemptBase, proctoringBypassedAt: null, proctoringBypassRevokedAt: null };
        tenantPrisma.forTenant
          .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examWithoutCapture }))
          .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
          .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(txFor(attempt)));
        settlement.settleIfExpired.mockResolvedValue(attempt);
        settlement.remainingSeconds.mockReturnValue(1000);

        const result = await service.getCurrent(session);

        expect((result as any).screenShareRequired).toBe(false);
      });

      // The whole point: a bypass narrows what is punished, never what is watched, so
      // screenCaptureEnabled itself stays true under a bypass (see resolveProctoringConfig) --
      // but the candidate must not be blocked by the share overlay while bypassed, since the
      // server also skips the pause for a bypassed attempt (see screenShareState()). Without
      // this, a bypassed candidate sees a blocking overlay while their clock keeps running.
      it('is false when a bypass is active even though screenCaptureEnabled stays true', async () => {
        const examWithCapture = { ...exam, screenCaptureEnabled: true };
        const attempt = { ...attemptBase, proctoringBypassedAt: new Date(), proctoringBypassRevokedAt: null };
        tenantPrisma.forTenant
          .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examWithCapture }))
          .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
          .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(txFor(attempt)));
        settlement.settleIfExpired.mockResolvedValue(attempt);
        settlement.remainingSeconds.mockReturnValue(1000);

        const result = await service.getCurrent(session);

        expect((result as any).exam.proctoring.screenCaptureEnabled).toBe(true);
        expect((result as any).screenShareRequired).toBe(false);
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
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result.sections).toEqual([{ title: 'Section One', questionCount: 0 }]);
    });

    it('returns the effective duration (exam duration + extraTimePercent) when the invitation has an accommodation', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) }, examSection: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, extraTimePercent: 50 }))
        .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
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
        exam: { title: 'Backend Round', proctoring: { enableAntiCheating: true, webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
        sections: [
          {
            title: 'Section One', targetDurationMinutes: 20, requiredCount: null,
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
        organizationName: 'Acme Corp',
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
        .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
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
        .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
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
        .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
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
        .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect((result as any).feedback).toEqual({
        status: 'settled', visibility: 'breakdown', passFail: 'fail', percentage: 50,
        sections: [{ title: 'Section One', score: 5, maxScore: 10 }],
      });
    });

    it('scores a breakdown section by its best-N answers when requiredCount is set, not a flat sum of all questions', async () => {
      // 5 questions worth 10 marks each, requiredCount 3, 3 answered correctly. A flat sum
      // (the pre-fix bug) would report 30/50 here, contradicting the 100% printed above it.
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1', 'q2', 'q3', 'q4', 'q5']),
        sectionSnapshotJson: JSON.stringify([{
          sectionId: 's1', title: 'Section One', targetDurationMinutes: null, requiredCount: 3,
          questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
        }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn()
            .mockResolvedValueOnce([
              { id: 'q1', text: 'Q1', type: 'single_mcq', marks: 10, options: [] },
              { id: 'q2', text: 'Q2', type: 'single_mcq', marks: 10, options: [] },
              { id: 'q3', text: 'Q3', type: 'single_mcq', marks: 10, options: [] },
              { id: 'q4', text: 'Q4', type: 'single_mcq', marks: 10, options: [] },
              { id: 'q5', text: 'Q5', type: 'single_mcq', marks: 10, options: [] },
            ])
            .mockResolvedValueOnce([
              { id: 'q1', marks: 10 }, { id: 'q2', marks: 10 }, { id: 'q3', marks: 10 }, { id: 'q4', marks: 10 }, { id: 'q5', marks: 10 },
            ]),
        },
        answer: {
          findMany: jest.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              { questionId: 'q1', marksAwarded: 10 },
              { questionId: 'q2', marksAwarded: 10 },
              { questionId: 'q3', marksAwarded: 10 },
              { questionId: 'q4', marksAwarded: 0 },
              { questionId: 'q5', marksAwarded: 0 },
            ]),
        },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue({ score: 30, maxScore: 30, percentage: 100, passFail: 'pass' }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(0);
      const examWithVisibility = { ...invitationRecord, exam: { ...exam, feedbackVisibility: 'breakdown' } };
      tenantPrisma.forTenant.mockReset();
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(examWithVisibility))
        .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getCurrent(session);

      expect((result as any).feedback).toEqual({
        status: 'settled', visibility: 'breakdown', passFail: 'pass', percentage: 100,
        sections: [{ title: 'Section One', score: 30, maxScore: 30 }],
      });
    });

    it('sums every question in a breakdown section when requiredCount is absent (legacy snapshot), matching pre-feature behaviour', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1', 'q2']),
        // No requiredCount key at all -- this is what an attempt started before the feature
        // shipped actually has stored, not `requiredCount: null`.
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
        .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
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
        enableAntiCheating: true,
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
        proctoring: { enableAntiCheating: true, webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
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
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: 20, weightPercent: 60, poolTags: [], questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, weightPercent: 40, poolTags: [], questions: [{ questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      const createdData = tx.attempt.create.mock.calls[0][0].data;
      const snapshot = JSON.parse(createdData.sectionSnapshotJson);
      expect(snapshot).toEqual([
        { sectionId: 'section-1', title: 'Section One', targetDurationMinutes: 20, weightPercent: 60, questionIds: ['q1'] },
        { sectionId: 'section-2', title: 'Section Two', targetDurationMinutes: null, weightPercent: 40, questionIds: ['q2'] },
      ]);
    });

    // Guards the settlement contract: AttemptSettlementService reads weightPercent straight out of
    // this snapshot, and treats an entry missing it as a legacy (flat-scored) attempt -- so a
    // silently-dropped key here would quietly un-weight every newly started exam.
    it("freezes each section's weightPercent into the snapshot at start time", async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Only Section', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, weightPercent: 100, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      const snapshot = JSON.parse(tx.attempt.create.mock.calls[0][0].data.sectionSnapshotJson);
      expect(snapshot[0]).toHaveProperty('weightPercent', 100);
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

    // Guards the settlement contract: AttemptSettlementService reads requiredCount straight out
    // of this snapshot and treats a missing key as "all required". JSON.stringify drops undefined
    // keys, so a silently-absent field here would quietly un-limit every newly started exam --
    // hence toHaveProperty rather than a toEqual that would pass on absence.
    it("freezes each section's requiredCount into the snapshot at start time", async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Coding', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, weightPercent: 100, requiredCount: 3, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      const snapshot = JSON.parse(tx.attempt.create.mock.calls[0][0].data.sectionSnapshotJson);
      expect(snapshot[0]).toHaveProperty('requiredCount', 3);
    });

    it('freezes requiredCount as null for a section with no requirement', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Coding', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, weightPercent: 100, requiredCount: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      const snapshot = JSON.parse(tx.attempt.create.mock.calls[0][0].data.sectionSnapshotJson);
      expect(snapshot[0]).toHaveProperty('requiredCount', null);
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
        .mockImplementationOnce(() => Promise.resolve({ name: 'Acme Corp', logoPath: null }))
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
          proctoring: { enableAntiCheating: true, webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
        },
        schedulingWindowState: 'not_open',
        sections: [],
        organizationName: 'Acme Corp',
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

        expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(tx, exam, attempt, 'tab_switch', undefined, undefined);
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

        expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(tx, exam, attempt, 'window_blur', { durationMs: 3000 }, undefined);
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

    describe('a supplied screenshot', () => {
      const examWithCapture = { ...exam, screenCaptureEnabled: true };
      const examWithoutCapture = { ...exam, screenCaptureEnabled: false };

      function mockScoped(examOverride: unknown, tx: unknown) {
        tenantPrisma.forTenant
          .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examOverride }))
          .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));
      }

      // Same as mockScoped, but for the cases that actually upload a screen capture: those run
      // a second, separate scoped forTenant call (the commit phase) after the upload -- see
      // ADO #6810 and mockBootstrapThenTwoScopedCalls above.
      function mockScopedTwice(examOverride: unknown, tx: unknown) {
        tenantPrisma.forTenant
          .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examOverride }))
          .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx))
          .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));
      }

      it('uploads it outside the transaction, then merges the resulting URL into the event metadata and atomically increments Attempt.screenCaptureCount in a second, separate transaction when screenCaptureEnabled is true', async () => {
        const tx = {
          attempt: {
            findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress', screenCaptureCount: 0 }),
            update: jest.fn().mockResolvedValue({ id: 'attempt-1', screenCaptureCount: 1 }),
          },
          proctoringEvent: {
            create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }),
          },
        };
        mockScopedTwice(examWithCapture, tx);

        await service.reportProctoringEvent(session, { eventType: 'looking_down', screenshot: 'data:image/jpeg;base64,abc' });

        expect(blobStorage.uploadDataUri).toHaveBeenCalledWith(expect.stringContaining('screen-captures/attempt-1-'), 'data:image/jpeg;base64,abc');
        const uploadedUrl = await blobStorage.uploadDataUri.mock.results[0].value;
        expect(tx.attempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { screenCaptureCount: { increment: 1 } } });
        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: JSON.stringify({ screenshot: uploadedUrl }) },
        });
        // Three separate forTenant calls -- bootstrap, decide, commit -- is what actually
        // discriminates this from the pre-split shape: call order alone (find, then upload, then
        // update/create) would look identical whether or not the upload sat inside a single
        // transaction, so it isn't asserted here.
        expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(3);
      });

      it('is ignored silently when screenCaptureEnabled is false -- no upload, the violation is still recorded without an image', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);

        const result = await service.reportProctoringEvent(session, { eventType: 'looking_down', screenshot: 'data:image/jpeg;base64,abc' });

        expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: null },
        });
        expect(result.id).toBe('evt-1');
      });

      it('uploads to the screen-captures/ prefix keyed by attempt id, mirroring the webcam snapshot path shape', async () => {
        const tx = {
          attempt: {
            findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress', screenCaptureCount: 0 }),
            update: jest.fn().mockResolvedValue({ id: 'attempt-1', screenCaptureCount: 1 }),
          },
          proctoringEvent: {
            create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }),
          },
        };
        mockScoped(examWithCapture, tx);

        await service.reportProctoringEvent(session, { eventType: 'looking_down', screenshot: 'data:image/jpeg;base64,abc' });

        expect(blobStorage.uploadDataUri).toHaveBeenCalledWith(
          expect.stringMatching(/^screen-captures\/attempt-1-\d+\.jpg$/),
          'data:image/jpeg;base64,abc',
        );
      });

      it('skips the upload and records screenshotCapReached once Attempt.screenCaptureCount is already at the 150 cap -- reads the counter column, not a metadata scan', async () => {
        const tx = {
          attempt: {
            findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress', screenCaptureCount: 150 }),
            update: jest.fn(),
          },
          proctoringEvent: {
            create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }),
            // Deliberately no `count` mock: if the cap check still fell back to scanning prior
            // events (the old `LIKE '%"screenshot":%'` grep), calling it here would throw a
            // TypeError instead of reaching the assertions below.
          },
        };
        mockScoped(examWithCapture, tx);

        const result = await service.reportProctoringEvent(session, { eventType: 'looking_down', screenshot: 'data:image/jpeg;base64,abc' });

        expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
        expect(tx.attempt.update).not.toHaveBeenCalled();
        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: JSON.stringify({ screenshotCapReached: true }) },
        });
        expect(result.id).toBe('evt-1');
      });

      it('still records the violation without an image, and does not increment the counter, when the upload throws', async () => {
        const tx = {
          attempt: {
            findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress', screenCaptureCount: 0 }),
            update: jest.fn(),
          },
          proctoringEvent: {
            create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }),
          },
        };
        mockScopedTwice(examWithCapture, tx);
        const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
        blobStorage.uploadDataUri.mockRejectedValueOnce(new Error('blob storage unavailable'));

        const result = await service.reportProctoringEvent(session, { eventType: 'looking_down', screenshot: 'data:image/jpeg;base64,abc' });

        expect(tx.attempt.update).not.toHaveBeenCalled();
        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: null },
        });
        expect(result.id).toBe('evt-1');
        expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to upload screen capture', expect.any(Error));
      });

      it('records the violation without an image, and does not increment the counter, when the upload does not resolve within the bound (guards the transaction timeout)', async () => {
        jest.useFakeTimers();
        try {
          const tx = {
            attempt: {
              findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress', screenCaptureCount: 0 }),
              update: jest.fn(),
            },
            proctoringEvent: {
              create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }),
            },
          };
          mockScopedTwice(examWithCapture, tx);
          const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
          // Never resolves -- simulates a blob upload that outlives the bound.
          blobStorage.uploadDataUri.mockReturnValueOnce(new Promise(() => {}));

          const resultPromise = service.reportProctoringEvent(session, {
            eventType: 'looking_down',
            screenshot: 'data:image/jpeg;base64,abc',
          });
          await jest.advanceTimersByTimeAsync(3000);
          const result = await resultPromise;

          expect(tx.attempt.update).not.toHaveBeenCalled();
          expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
            data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: null },
          });
          expect(result.id).toBe('evt-1');
          expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to upload screen capture', expect.any(Error));
        } finally {
          jest.useRealTimers();
        }
      });

      it('threads an uploaded screenshot url into registerBrowserActivityViolation as the server-metadata argument, separate from client metadata', async () => {
        // Regression coverage for fix round 6: the screenshot URL must travel as the dedicated
        // serverMetadata argument, not merged into the client metadata argument -- merging it in
        // would have it sanitized (and stripped) right back out. See
        // AttemptSettlementService.registerBrowserActivityViolation and scc-task-5-report.md.
        const attempt = { id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress', screenCaptureCount: 0 };
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue(attempt), update: jest.fn().mockResolvedValue({ ...attempt, screenCaptureCount: 1 }) },
        };
        mockScopedTwice(examWithCapture, tx);
        settlement.registerBrowserActivityViolation.mockResolvedValue({
          attempt: { ...attempt, browserActivityViolationCount: 1, status: 'paused' },
          strike: 1,
          event: { id: 'evt-1', eventType: 'tab_switch', severity: 'medium' },
        });

        await service.reportProctoringEvent(session, { eventType: 'tab_switch', screenshot: 'data:image/jpeg;base64,abc' });

        const uploadedUrl = await blobStorage.uploadDataUri.mock.results[0].value;
        expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(
          tx,
          examWithCapture,
          attempt,
          'tab_switch',
          undefined,
          { screenshot: uploadedUrl },
        );
      });

      it('strips a client-forged screenshot/screenshotCapReached metadata key (case-insensitively) even when capture is off and no real screenshot is sent', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);

        await service.reportProctoringEvent(session, {
          eventType: 'looking_down',
          metadata: { screenshot: 'https://attacker.example/clean-desk.jpg', SCREENSHOTCAPREACHED: true, note: 'legit' },
        });

        expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: JSON.stringify({ note: 'legit' }) },
        });
      });

      it('strips a client-forged snapshot metadata key -- candidates.service.ts erase() now treats metadataJson.snapshot as a blob to delete, so a forged one is a delete instruction, not just fake evidence (fix round 1 regression)', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);

        await service.reportProctoringEvent(session, {
          eventType: 'looking_down',
          metadata: { snapshot: 'https://attacker.example/other-candidates-webcam.jpg', note: 'legit' },
        });

        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: JSON.stringify({ note: 'legit' }) },
        });
      });

      it('strips a forged screenshot key nested inside an object one level deep -- a shallow strip would leave it matchable by the cap-count query', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);

        await service.reportProctoringEvent(session, {
          eventType: 'looking_down',
          metadata: { evidence: { screenshot: 'https://attacker.example/clean-desk.jpg', note: 'legit' } },
        });

        expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: {
            attemptId: 'attempt-1',
            eventType: 'looking_down',
            severity: 'medium',
            metadataJson: JSON.stringify({ evidence: { note: 'legit' } }),
          },
        });
      });

      it('strips a forged screenshot key nested inside an array element', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);

        await service.reportProctoringEvent(session, {
          eventType: 'looking_down',
          metadata: { items: [{ screenshotCapReached: true, note: 'legit' }] },
        });

        expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: {
            attemptId: 'attempt-1',
            eventType: 'looking_down',
            severity: 'medium',
            metadataJson: JSON.stringify({ items: [{ note: 'legit' }] }),
          },
        });
      });

      it('strips a key that smuggles a raw quote character, which would otherwise form the literal "screenshot": in the serialized JSON', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);

        await service.reportProctoringEvent(session, {
          eventType: 'looking_down',
          metadata: { '"screenshot': 1, note: 'legit' },
        });

        expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
        const [[{ data }]] = tx.proctoringEvent.create.mock.calls;
        expect(foldForCapCheck(data.metadataJson)).not.toContain('"screenshot":');
        expect(data).toEqual({
          attemptId: 'attempt-1',
          eventType: 'looking_down',
          severity: 'medium',
          metadataJson: JSON.stringify({ note: 'legit' }),
        });
      });

      it('drops metadata that overflows the stack (absurdly deep nesting) rather than losing the violation to an uncaught RangeError', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);
        const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

        // Deep enough to overflow the stack in either the recursive strip or a later
        // JSON.stringify of the same shape, regardless of the exact stack size this process
        // happens to run with.
        let deeplyNested: Record<string, unknown> = { value: 1 };
        for (let i = 0; i < 50_000; i++) {
          deeplyNested = { nested: deeplyNested };
        }

        const result = await service.reportProctoringEvent(session, { eventType: 'looking_down', metadata: deeplyNested });

        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: null },
        });
        expect(result.id).toBe('evt-1');
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          'Dropping unprocessable proctoring event metadata (attempt attempt-1, event looking_down)',
          expect.any(Error),
        );
      });

      it('strips a fullwidth Unicode variant of the key that the DB collation folds to "screenshot"', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);

        // U+FF53 FULLWIDTH LATIN SMALL LETTER S -- confirmed against the actual dev database
        // (SQL_Latin1_General_CP1_CI_AS) to LIKE-match "screenshot" in the cap-count query.
        await service.reportProctoringEvent(session, {
          eventType: 'looking_down',
          metadata: { 'ｓcreenshot': 'https://attacker.example/clean-desk.jpg', note: 'legit' },
        });

        const [[{ data }]] = tx.proctoringEvent.create.mock.calls;
        expect(foldForCapCheck(data.metadataJson)).not.toContain('"screenshot":');
        expect(data).toEqual({
          attemptId: 'attempt-1',
          eventType: 'looking_down',
          severity: 'medium',
          metadataJson: JSON.stringify({ note: 'legit' }),
        });
      });

      it('strips a long-s Unicode variant of the key (NFKC-folds to "screenshot" even though this DB build does not fold it)', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);

        // U+017F LATIN SMALL LETTER LONG S. Did not LIKE-match under this dev database's
        // collation when checked directly, but NFKC folds it regardless -- deliberately more
        // aggressive than the one collation we could verify, per scc-task-5-report.md.
        await service.reportProctoringEvent(session, {
          eventType: 'looking_down',
          metadata: { 'ſcreenshot': 'https://attacker.example/clean-desk.jpg', note: 'legit' },
        });

        const [[{ data }]] = tx.proctoringEvent.create.mock.calls;
        expect(foldForCapCheck(data.metadataJson)).not.toContain('"screenshot":');
        expect(data).toEqual({
          attemptId: 'attempt-1',
          eventType: 'looking_down',
          severity: 'medium',
          metadataJson: JSON.stringify({ note: 'legit' }),
        });
      });

      it('no longer drops metadata whose plain VALUE happens to fold to the old cap-count literal via fullwidth punctuation -- that serialized-text guard is deleted (task 6804) because the cap no longer scans metadata at all', async () => {
        const tx = {
          attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress' }) },
          proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }) },
        };
        mockScoped(examWithoutCapture, tx);

        // U+FF02 FULLWIDTH QUOTATION MARK + U+FF1A FULLWIDTH COLON -- this used to fold, under
        // the deleted NFKC check, to a literal that would have dropped the whole metadata
        // object. No key here is forged (`trigger` isn't screenshot-shaped), so the key-strip
        // half leaves it untouched, and there is no other guard left to drop it.
        const result = await service.reportProctoringEvent(session, {
          eventType: 'looking_down',
          metadata: { trigger: '＂screenshot＂：' },
        });

        expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
          data: { attemptId: 'attempt-1', eventType: 'looking_down', severity: 'medium', metadataJson: JSON.stringify({ trigger: '＂screenshot＂：' }) },
        });
        expect(result.id).toBe('evt-1');
      });

      describe('the four previously-smuggled payloads can no longer affect the cap at all (task 6804 regression)', () => {
        // Each of these used to be able to inflate the old LIKE-based scan of prior events'
        // metadataJson and trip the cap early (a self-inflicted evidence blackout for the
        // candidate, or -- run the other way -- let a candidate who wanted to keep capturing
        // dodge it). The cap now reads only Attempt.screenCaptureCount, a real counter no
        // metadata content can reach, so none of these payloads change the outcome any more.
        it.each([
          ['a screenshot key nested one level deep', { evidence: { screenshot: 'https://attacker.example/x.jpg' } }],
          ['a key that smuggles a raw quote character', { '"screenshot': 1 }],
          ['a fullwidth Unicode variant of the key', { 'ｓcreenshot': 'https://attacker.example/x.jpg' }],
          ['fullwidth quote+colon inside an ordinary value', { trigger: '＂screenshot＂：' }],
        ])('%s has no effect on whether the upload proceeds or the counter increments', async (_label, smuggledMetadata) => {
          const tx = {
            attempt: {
              findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress', screenCaptureCount: 149 }),
              update: jest.fn().mockResolvedValue({ id: 'attempt-1', screenCaptureCount: 150 }),
            },
            proctoringEvent: {
              create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }),
              // Deliberately no `count`: the old grep would have called this to fold the
              // smuggled payload into its scan. Its absence here means a resurrected grep
              // fails the test with a TypeError rather than silently passing.
            },
          };
          mockScopedTwice(examWithCapture, tx);

          const result = await service.reportProctoringEvent(session, {
            eventType: 'looking_down',
            screenshot: 'data:image/jpeg;base64,abc',
            metadata: smuggledMetadata,
          });

          // screenCaptureCount was 149 (one under the cap) regardless of the smuggled payload --
          // the real upload proceeds and the real counter increments by exactly 1.
          expect(blobStorage.uploadDataUri).toHaveBeenCalled();
          expect(tx.attempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { screenCaptureCount: { increment: 1 } } });
          expect(result.id).toBe('evt-1');
        });

        it.each([
          ['a screenshot key nested one level deep', { evidence: { screenshot: 'https://attacker.example/x.jpg' } }],
          ['a key that smuggles a raw quote character', { '"screenshot': 1 }],
          ['a fullwidth Unicode variant of the key', { 'ｓcreenshot': 'https://attacker.example/x.jpg' }],
          ['fullwidth quote+colon inside an ordinary value', { trigger: '＂screenshot＂：' }],
        ])('%s cannot suppress the cap either, once Attempt.screenCaptureCount is genuinely at 150', async (_label, smuggledMetadata) => {
          const tx = {
            attempt: {
              findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', browserActivityViolationCount: 0, status: 'in_progress', screenCaptureCount: 150 }),
              update: jest.fn(),
            },
            proctoringEvent: {
              create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'looking_down', severity: 'medium' }),
            },
          };
          mockScoped(examWithCapture, tx);

          const result = await service.reportProctoringEvent(session, {
            eventType: 'looking_down',
            screenshot: 'data:image/jpeg;base64,abc',
            metadata: smuggledMetadata,
          });

          expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
          expect(tx.attempt.update).not.toHaveBeenCalled();
          const [[{ data }]] = tx.proctoringEvent.create.mock.calls;
          expect(data.attemptId).toBe('attempt-1');
          // The forged/smuggled bits of metadata may or may not survive the key-strip depending
          // on shape (a bare value like `trigger` isn't forged and passes through), but
          // screenshotCapReached is always present and true regardless of payload shape.
          expect(JSON.parse(data.metadataJson).screenshotCapReached).toBe(true);
          expect(result.id).toBe('evt-1');
        });
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
      mockBootstrapThenTwoScopedCalls(tx);
      settlement.registerWebcamViolation = jest.fn().mockResolvedValue({ attempt: { ...attempt, status: 'paused', webcamViolationCount: 1 }, strike: 1 });

      const result = await service.webcamViolation(session, { reason: 'no_face', snapshot: 'x' });

      expect(result).toEqual({ strike: 1, status: 'paused' });
      expect(blobStorage.uploadDataUri).toHaveBeenCalledWith(expect.stringContaining('webcam-snapshots/attempt-1-'), 'x');
      const uploadedUrl = await blobStorage.uploadDataUri.mock.results[0].value;
      expect(settlement.registerWebcamViolation).toHaveBeenCalledWith(tx, exam, attempt, 'no_face', uploadedUrl, undefined);
      // Three separate forTenant calls -- bootstrap, decide, commit -- proves the upload isn't
      // nested inside either scoped transaction (see ADO #6810).
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(3);
    });

    it('threads a screenshot through the same cap-count/upload helper reportProctoringEvent uses, landing it in registerWebcamViolation, with both uploads run outside either transaction', async () => {
      const screenCaptureExam = { ...exam, screenCaptureEnabled: true };
      const invitationWithScreenCapture = { ...invitationRecord, exam: screenCaptureExam };
      const attempt = { id: 'attempt-1', status: 'in_progress', webcamViolationCount: 0, screenCaptureCount: 0 };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt), update: jest.fn().mockResolvedValue({ ...attempt, screenCaptureCount: 1 }) },
      };
      mockBootstrapThenTwoScopedCalls(tx, invitationWithScreenCapture);
      settlement.registerWebcamViolation = jest.fn().mockResolvedValue({ attempt: { ...attempt, status: 'paused', webcamViolationCount: 1 }, strike: 1 });

      await service.webcamViolation(session, { reason: 'no_face', snapshot: 'x', screenshot: 'data:image/jpeg;base64,abc' });

      expect(blobStorage.uploadDataUri).toHaveBeenCalledWith(expect.stringContaining('screen-captures/attempt-1-'), 'data:image/jpeg;base64,abc');
      const screenshotUrl = await blobStorage.uploadDataUri.mock.results[1].value;
      expect(tx.attempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { screenCaptureCount: { increment: 1 } } });
      expect(settlement.registerWebcamViolation).toHaveBeenCalledWith(
        tx,
        screenCaptureExam,
        attempt,
        'no_face',
        expect.any(String),
        { screenshot: screenshotUrl },
      );
      // Three separate forTenant calls -- bootstrap, decide, commit -- is what actually
      // discriminates this from the pre-split shape (call order alone would look the same
      // either way, since find/upload/update run in that sequence regardless of which
      // transaction, if any, holds them).
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(3);
    });

    it('ignores a supplied screenshot silently when the exam has screenCaptureEnabled false', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', webcamViolationCount: 0 };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      mockBootstrapThenTwoScopedCalls(tx);
      settlement.registerWebcamViolation = jest.fn().mockResolvedValue({ attempt: { ...attempt, status: 'paused', webcamViolationCount: 1 }, strike: 1 });

      await service.webcamViolation(session, { reason: 'no_face', snapshot: 'x', screenshot: 'data:image/jpeg;base64,abc' });

      expect(blobStorage.uploadDataUri).toHaveBeenCalledTimes(1);
      expect(blobStorage.uploadDataUri).not.toHaveBeenCalledWith(expect.stringContaining('screen-captures/'), expect.anything());
      expect(settlement.registerWebcamViolation).toHaveBeenCalledWith(tx, exam, attempt, 'no_face', expect.any(String), undefined);
    });

    it('ignores the violation and leaves the attempt unchanged when webcam proctoring is disabled on the exam', async () => {
      const disabledExam = { ...exam, webcamProctoringEnabled: false };
      const invitationWithDisabledExam = { ...invitationRecord, exam: disabledExam };
      const attempt = { id: 'attempt-1', status: 'in_progress', webcamViolationCount: 2 };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(invitationWithDisabledExam))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.webcamViolation(session, { reason: 'no_face', snapshot: 'x' });

      expect(result).toEqual({ strike: 2, status: 'in_progress' });
      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
      expect(settlement.registerWebcamViolation).not.toHaveBeenCalled();
    });

    it('still records the violation (with an empty snapshot) when the webcam-snapshot upload throws, rather than losing it to an uncaught rejection', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', webcamViolationCount: 0 };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      mockBootstrapThenTwoScopedCalls(tx);
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
      blobStorage.uploadDataUri.mockRejectedValueOnce(new Error('blob storage unavailable'));
      settlement.registerWebcamViolation = jest.fn().mockResolvedValue({ attempt: { ...attempt, status: 'paused', webcamViolationCount: 1 }, strike: 1 });

      const result = await service.webcamViolation(session, { reason: 'no_face', snapshot: 'x' });

      expect(result).toEqual({ strike: 1, status: 'paused' });
      expect(settlement.registerWebcamViolation).toHaveBeenCalledWith(tx, exam, attempt, 'no_face', '', undefined);
      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to upload webcam snapshot', expect.any(Error));
    });

    it('still records the violation when the webcam-snapshot upload does not resolve within the bound (guards the transaction timeout)', async () => {
      jest.useFakeTimers();
      try {
        const attempt = { id: 'attempt-1', status: 'in_progress', webcamViolationCount: 0 };
        const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
        mockBootstrapThenTwoScopedCalls(tx);
        const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
        blobStorage.uploadDataUri.mockReturnValueOnce(new Promise(() => {})); // never resolves
        settlement.registerWebcamViolation = jest.fn().mockResolvedValue({ attempt: { ...attempt, status: 'paused', webcamViolationCount: 1 }, strike: 1 });

        const resultPromise = service.webcamViolation(session, { reason: 'no_face', snapshot: 'x' });
        await jest.advanceTimersByTimeAsync(3000);
        const result = await resultPromise;

        expect(result).toEqual({ strike: 1, status: 'paused' });
        expect(settlement.registerWebcamViolation).toHaveBeenCalledWith(tx, exam, attempt, 'no_face', '', undefined);
        expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to upload webcam snapshot', expect.any(Error));
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('webcamSnapshot', () => {
    it('stores a low-severity webcam_snapshot event and does not emit a live flag', async () => {
      const client = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      mockBootstrapThenPlainClient(client);

      const result = await service.webcamSnapshot(session, { snapshot: 'data:image/jpeg;base64,abc' });

      expect(result).toEqual({ ok: true });
      // Finding 7: a supported content type (image/jpeg here) routes through the pre-decoded
      // blobStorage.upload() path instead of uploadDataUri, reusing the one decode done up front
      // in webcamSnapshot rather than decoding the data URI a second time.
      expect(blobStorage.upload).toHaveBeenCalledWith(
        expect.stringContaining('webcam-snapshots/attempt-1-'),
        Buffer.from('abc', 'base64'),
        'image/jpeg',
      );
      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
      const created = client.proctoringEvent.create.mock.calls[0][0];
      expect(created.data.attemptId).toBe('attempt-1');
      expect(created.data.eventType).toBe('webcam_snapshot');
      expect(created.data.severity).toBe('low');
      expect(JSON.parse(created.data.metadataJson).snapshot).toMatch(/^https:\/\/blob\.test\/webcam-snapshots\/attempt-1-/);
      expect(monitoringGateway.emitProctoringFlag).not.toHaveBeenCalled();
      // ADO #6809: the attempt read and the event write now run on the plain client instead of
      // forTenant -- only resolveContext's own invitation bootstrap still goes through forTenant
      // on this path. This is the assertion that would fail if someone reverted the fix.
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
      expect(tenantPrisma.withoutTenantScope).toHaveBeenCalledTimes(2);
      // faceVerificationEnabled is false on the shared `exam` fixture -- verification must not
      // run (let alone cost a model call) for every exam that hasn't opted in.
      expect(faceVerification.verifySnapshot).not.toHaveBeenCalled();
    });

    // Item 3 (task-8): the stored blob path must reach FaceVerificationService, or the
    // recruiter's side-by-side evidence view (a later task) shows no evidence for a mismatch.
    it('calls faceVerification.verifySnapshot with the decoded frame and the stored snapshot path when face verification is enabled', async () => {
      const client = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      mockBootstrapThenPlainClient(client, { ...invitationRecord, exam: { ...exam, faceVerificationEnabled: true } });

      await service.webcamSnapshot(session, { snapshot: 'data:image/jpeg;base64,YWJj' });
      // Fire-and-forget relative to the response (see webcamSnapshot's own comment) -- let its
      // microtasks settle before asserting on the call it queued.
      await new Promise((resolve) => setImmediate(resolve));

      expect(faceVerification.verifySnapshot).toHaveBeenCalledWith(
        'attempt-1',
        'org-1',
        Buffer.from('YWJj', 'base64'),
        expect.stringMatching(/^https:\/\/blob\.test\/webcam-snapshots\/attempt-1-/),
      );
    });

    // Stage-2 gate (task-8 brief): flag is the only action allowed to affect the candidate right
    // now. This is the test the brief explicitly calls for: a confirmed mismatch on an exam set
    // to 'block' must not block (or pause) anyone yet -- enforcement beyond flag is deferred to
    // stage 3. Mutating checkFaceMismatch to route 'pause'/'block' through registerWebcamViolation
    // must make this fail.
    it('does not pause or block the candidate on a confirmed mismatch even when faceMismatchAction is "block"', async () => {
      const client = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      mockBootstrapThenPlainClient(client, { ...invitationRecord, exam: { ...exam, faceVerificationEnabled: true, faceMismatchAction: 'block' } });
      faceVerification.verifySnapshot.mockResolvedValue({ verdict: 'mismatch', score: 0.1, confirmed: true });

      const result = await service.webcamSnapshot(session, { snapshot: 'data:image/jpeg;base64,YWJj' });
      await new Promise((resolve) => setImmediate(resolve));

      expect(result).toEqual({ ok: true });
      expect(settlement.registerWebcamViolation).not.toHaveBeenCalled();
    });

    // Finding 1 (task-8, CRITICAL): checkFaceMismatch is fire-and-forget (`void ...`), relative
    // to this response. Node 24 here defaults to --unhandled-rejections=throw and main.ts installs
    // no unhandledRejection handler, so a rejecting verifySnapshot with no .catch on the fire-and-
    // forget call used to escape application code entirely and take the whole process -- every
    // concurrent candidate's exam -- down with it. This listens for the real Node event, not just
    // a mock, so it would have caught the original bug and catches a regression to it.
    it('leaves the snapshot request successful and produces no unhandled rejection when verifySnapshot rejects', async () => {
      const client = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      mockBootstrapThenPlainClient(client, { ...invitationRecord, exam: { ...exam, faceVerificationEnabled: true } });
      faceVerification.verifySnapshot.mockRejectedValue(new Error('embedding service unreachable'));
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      const unhandledRejections: unknown[] = [];
      const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
      process.on('unhandledRejection', onUnhandledRejection);
      let result: { ok: true };
      try {
        result = await service.webcamSnapshot(session, { snapshot: 'data:image/jpeg;base64,YWJj' });
        // Give the fire-and-forget checkFaceMismatch's rejection -- and its .catch -- a couple of
        // microtask turns to actually run; an unhandled rejection would surface during these.
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
      } finally {
        process.off('unhandledRejection', onUnhandledRejection);
      }

      expect(result).toEqual({ ok: true });
      expect(unhandledRejections).toEqual([]);
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Face mismatch check failed for attempt attempt-1'));
    });

    it('still records the (informational) event with an empty snapshot when the upload throws, rather than 500ing', async () => {
      const client = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      mockBootstrapThenPlainClient(client);
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
      // image/jpeg is a supported content type, so this snapshot routes through blobStorage.upload
      // (finding 7's pre-decoded path), not uploadDataUri -- see the test above.
      blobStorage.upload.mockRejectedValueOnce(new Error('blob storage unavailable'));

      const result = await service.webcamSnapshot(session, { snapshot: 'data:image/jpeg;base64,abc' });

      expect(result).toEqual({ ok: true });
      const created = client.proctoringEvent.create.mock.calls[0][0];
      expect(JSON.parse(created.data.metadataJson).snapshot).toBe('');
      // uploadWebcamSnapshot is the same shared helper webcamViolation uses, so it's the same
      // message -- this call site no longer has its own distinct "periodic" wording.
      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to upload webcam snapshot', expect.any(Error));
    });

    // Previously untested, and now load-bearing for the toHaveBeenCalledTimes(2) assertion above:
    // no attempt means phase 1 returns null and the function must return early -- no upload, no
    // second (commit) call.
    it('does nothing when no attempt has been started, without uploading or writing an event', async () => {
      const client = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenPlainClient(client);

      const result = await service.webcamSnapshot(session, { snapshot: 'data:image/jpeg;base64,abc' });

      expect(result).toEqual({ ok: true });
      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
      expect(tenantPrisma.withoutTenantScope).toHaveBeenCalledTimes(1);
    });

    // ADO #6809: a plain-client call still draws from the same pool, so pool exhaustion is still
    // reachable here. webcamSnapshot must not swallow or downgrade it -- the candidate-facing
    // 503 (mapped by TenantPrismaService.withoutTenantScope; see tenant-prisma.service.spec.ts)
    // has to come straight through, not surface as an unhandled 500.
    it('propagates a pool-exhausted 503 from the plain-client read rather than swallowing it', async () => {
      const poolExhausted = new HttpException(POOL_EXHAUSTED_RESPONSE, HttpStatus.SERVICE_UNAVAILABLE);
      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(invitationRecord));
      tenantPrisma.withoutTenantScope.mockImplementationOnce(() => Promise.reject(poolExhausted));

      await expect(service.webcamSnapshot(session, { snapshot: 'data:image/jpeg;base64,abc' })).rejects.toBe(poolExhausted);
      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
    });

    // Finding 5 (task-8) / ADO #6810: verifySnapshot's embed() call is exactly the slow I/O that
    // must never run inside a held pooled connection. Today checkFaceMismatch is fire-and-forget
    // and never wrapped in forTenant at all, so this always passes -- but before finding 2's fix,
    // a mistaken `forTenant(ctx, () => checkFaceMismatch(...))` rewrite was only incidentally
    // caught by forTenant's bare-jest.fn() mock never invoking its callback. Once forTenant gets a
    // real default (finding 2), that incidental detection disappears -- this is the real
    // re-entrancy check that replaces it, following the idiom at this file's own "runs embedding
    // strictly outside every forTenant transaction" test above and face-verification.service.spec.ts's
    // "runs decrypt and embed strictly outside every forTenant transaction": a flag that is true
    // only while a forTenant callback is actually executing, so it can't be fooled by call order.
    it('runs the face-mismatch check strictly outside every forTenant transaction (ADO #6810)', async () => {
      const client = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      let insideTx = false;
      tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) => {
        insideTx = true;
        try {
          return await fn({
            invitation: {
              findUnique: jest.fn().mockResolvedValue({ ...invitationRecord, exam: { ...exam, faceVerificationEnabled: true } }),
            },
          });
        } finally {
          insideTx = false;
        }
      });
      tenantPrisma.withoutTenantScope.mockImplementation((fn: (client: unknown) => unknown) => fn(client));
      // CAPTURE the flag here, ASSERT in the test body. An `expect()` inside this mock would be
      // swallowed: the call is fire-and-forget and its .catch (required, see the call site) turns
      // any throw into a logger.warn, so the test would stay green under the exact mutation it
      // exists to catch. Anything reachable from `void this.checkFaceMismatch(...)` has this
      // property -- never assert inside it.
      let sawInsideTx: boolean | null = null;
      faceVerification.verifySnapshot = jest.fn(async () => {
        sawInsideTx = insideTx;
        return { verdict: 'skipped', score: null, confirmed: false };
      });

      await service.webcamSnapshot(session, { snapshot: 'data:image/jpeg;base64,YWJj' });
      // Fire-and-forget relative to the response -- let its microtasks settle before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      expect(faceVerification.verifySnapshot).toHaveBeenCalledTimes(1);
      expect(sawInsideTx).toBe(false);
    });

    // The fast path added for finding 7 hands the decoded buffer straight to blobStorage.upload,
    // which enforces NO content-type allowlist. A candidate-supplied data:text/html reaching it
    // would be hosted from the storage origin, so the allowlist check in front of it is load
    // bearing -- this pins it to uploadDataUri, which rejects the type as it always has.
    it('routes a disallowed data-uri content type through uploadDataUri rather than the raw upload fast path', async () => {
      const client = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(invitationRecord));
      tenantPrisma.withoutTenantScope.mockImplementation((fn: (c: unknown) => unknown) => fn(client));
      blobStorage.upload = jest.fn();
      blobStorage.uploadDataUri = jest.fn().mockRejectedValue(new Error('Unsupported data URI content type: text/html'));

      await service.webcamSnapshot(session, { snapshot: 'data:text/html;base64,PGh0bWw+' });

      expect(blobStorage.upload).not.toHaveBeenCalled();
      expect(blobStorage.uploadDataUri).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordFaceEnrolment', () => {
    it('uploads the reference image and stores its PATH, never a signed URL', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob.core.windows.net/c/face/attempt-1.jpg');
      // Two scoped forTenant calls (read attempt, then write) with the upload running between
      // them, same "decide -- upload with no transaction open -- commit" shape as
      // reportProctoringEvent/webcamViolation (ADO #6810) -- mockBootstrapThenScoped only stubs
      // one scoped call and can't exercise this.
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, {
        status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', qualityJson: '{"faceCount":1}', consentGiven: true,
      });

      expect(blobStorage.uploadDataUri).toHaveBeenCalled();
      const stored = upsert.mock.calls[0][0].create.referenceImagePath;
      expect(stored).not.toContain('?');
      expect(stored).toContain('face/');
    });

    it('records not_verified with no image when capture failed', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      blobStorage.uploadDataUri = jest.fn();
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'not_verified', consentGiven: true });

      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
      expect(upsert.mock.calls[0][0].create).toMatchObject({ status: 'not_verified', referenceImagePath: null });
    });

    // Consent is the lawful basis for holding biometric data. No consent, no IMAGE, ever.
    it('refuses to store an image when consent was not given', async () => {
      const upsert = jest.fn();
      blobStorage.uploadDataUri = jest.fn();
      mockBootstrapThenScoped({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await expect(
        service.recordFaceEnrolment(session, { status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: false }),
      ).rejects.toThrow(/consent/i);
      expect(upsert).not.toHaveBeenCalled();
      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
    });

    // ...but a snapshot smuggled in alongside status:'not_verified' is still an image, and the
    // guard has to be about the image rather than about the status word.
    it('refuses a snapshot sent without consent even when the status says not_verified', async () => {
      const upsert = jest.fn();
      blobStorage.uploadDataUri = jest.fn();
      mockBootstrapThenScoped({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await expect(
        service.recordFaceEnrolment(session, { status: 'not_verified', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: false }),
      ).rejects.toThrow(/consent/i);
      expect(upsert).not.toHaveBeenCalled();
      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
    });

    // A declined consent must leave a flag with the candidate's name on it. Throwing here made a
    // refusal indistinguishable from an exam that never had face verification switched on.
    it('records a not_verified row with no image and no consentAt when the candidate declines', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      blobStorage.uploadDataUri = jest.fn();
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      const result = await service.recordFaceEnrolment(session, { status: 'not_verified', consentGiven: false });

      expect(result).toEqual({ status: 'not_verified' });
      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
      expect(upsert.mock.calls[0][0].create).toMatchObject({
        attemptId: 'attempt-1',
        status: 'not_verified',
        referenceImagePath: null,
        consentAt: null,
        capturedAt: null,
      });
    });

    // "enrolled" with nothing behind it shows a recruiter a green "Verified" badge backed by no
    // image at all. The API accepts the shape (the DTO's snapshot is optional), so the service
    // has to refuse to believe it.
    it('downgrades an enrolled status with no snapshot to not_verified rather than claiming a verification it cannot show', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      blobStorage.uploadDataUri = jest.fn();
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      const result = await service.recordFaceEnrolment(session, { status: 'enrolled', consentGiven: true });

      expect(result).toEqual({ status: 'not_verified' });
      expect(upsert.mock.calls[0][0].create).toMatchObject({ status: 'not_verified', referenceImagePath: null });
    });

    it('is idempotent — a retry replaces the previous row rather than failing on the unique key', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob.core.windows.net/c/face/attempt-1.jpg');
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: true });

      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { attemptId: 'attempt-1' } }));
    });
  });

  describe('recordFaceEnrolment — reference embedding', () => {
    it('stores the embedding ENCRYPTED, never as a bare vector', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      faceEmbedder.embed = jest.fn().mockResolvedValue(Float32Array.from([0.1, 0.2, 0.3]));
      crypto.encrypt = jest.fn((plain: string) => `enc(${plain})`);
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob/face/a1.jpg');
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: true });

      expect(crypto.encrypt).toHaveBeenCalled();
      expect(upsert.mock.calls[0][0].create.embedding).toMatch(/^enc\(/);
    });

    // The photo is the evidence a human reviews. If embedding fails, we must still keep it --
    // losing the reference over a model problem would make the attempt unverifiable forever.
    it('still enrols with a null embedding when the model is unavailable', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      faceEmbedder.embed = jest.fn().mockResolvedValue(null);
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob/face/a1.jpg');
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: true });

      expect(upsert.mock.calls[0][0].create.embedding).toBeNull();
      expect(upsert.mock.calls[0][0].create.status).toBe('enrolled');
    });

    it('does not attempt to embed a declined enrolment', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      faceEmbedder.embed = jest.fn();
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'not_verified', consentGiven: false });

      expect(faceEmbedder.embed).not.toHaveBeenCalled();
    });

    // Finding 1 (GDPR retention gap): a candidate withdrawing consent is the clearest possible
    // signal to stop holding their biometric template -- this must clear a previously-stored
    // embedding on the SAME request, not leave it for the 90-day retention sweep to eventually
    // catch (see face-retention.service.ts). Without this, the decline payload
    // (FaceEnrolmentStep.tsx's onDecline) nulls referenceImagePath but the update spread
    // `...(embedding ? { embedding } : {})` would omit the key entirely, leaving any
    // earlier-enrolled embedding sitting in the row untouched.
    it('clears a previously-stored embedding on the same request the candidate declines consent', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'not_verified', consentGiven: false });

      expect(upsert.mock.calls[0][0].update).toHaveProperty('embedding', null);
    });

    // Finding 1: crypto.encrypt throws for real (missing/invalid ORG_SECRETS_ENCRYPTION_KEY),
    // unlike embed() which never throws. Nothing caught that before -- recordFaceEnrolment would
    // reject after the blob upload had already run, leaving a photo in storage with no row
    // behind it and blocking the candidate from enrolling at all. It must degrade exactly like a
    // failed embed(): keep the reference image, null out the embedding, resolve normally.
    it('still enrols with a null embedding, and still upserts the row, when crypto.encrypt throws', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      faceEmbedder.embed = jest.fn().mockResolvedValue(Float32Array.from([0.1, 0.2, 0.3]));
      crypto.encrypt = jest.fn(() => {
        throw new Error('ORG_SECRETS_ENCRYPTION_KEY is not set');
      });
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob/face/a1.jpg');
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      const result = await service.recordFaceEnrolment(session, {
        status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: true,
      });

      expect(result).toEqual({ status: 'enrolled' });
      expect(upsert).toHaveBeenCalled();
      expect(upsert.mock.calls[0][0].create.embedding).toBeNull();
      expect(upsert.mock.calls[0][0].create.referenceImagePath).toBe('https://acct.blob/face/a1.jpg');
    });

    // Finding 3: a retry POST while the model is briefly unavailable produces no new embedding.
    // The update payload must leave the `embedding` column untouched rather than carrying an
    // explicit null that overwrites a previously-stored good vector.
    it('does not clear a previously-stored embedding when a retry produces no new one', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      faceEmbedder.embed = jest.fn().mockResolvedValue(null);
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob/face/a1.jpg');
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, {
        status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: true,
      });

      const updatePayload = upsert.mock.calls[0][0].update;
      expect(updatePayload).not.toHaveProperty('embedding');
      // create: is unaffected -- a brand-new row still records the (null) outcome explicitly.
      expect(upsert.mock.calls[0][0].create).toHaveProperty('embedding', null);
    });

    // Finding 2 / ADO #6810 regression guard: embed()+encrypt() must run strictly outside every
    // forTenant transaction, never inside the pooled connection any of them hold -- ONNX
    // inference under a held connection is exactly the pool-starvation shape #6810 fixed.
    //
    // A call-order assertion (comparing jest.fn().mock.invocationCallOrder for forTenant against
    // embed()) looks right but is vacuous: invocationCallOrder records when forTenant is
    // *called*, before its callback body runs, so work done inside the callback and work done
    // after forTenant resolves both satisfy "embed ran before forTenant[2] was called". This
    // particular assertion happened to still fail under the reviewer's mutation (it compares
    // against a *later* forTenant call, [2], so nesting embed inside an *earlier* one still
    // trips it) -- see task-6-report.md -- but that's incidental to this ordering, not a property
    // of the idiom, and the re-entrancy check below is strictly stronger: it directly measures
    // "is a forTenant callback executing right now", so it can't be fooled by call order at all.
    it('runs embedding strictly outside every forTenant transaction (ADO #6810)', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } };
      let insideTx = false;
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(invitationRecord))
        .mockImplementation(async (_ctx: unknown, fn: (t: unknown) => unknown) => {
          insideTx = true;
          try {
            return await fn(tx);
          } finally {
            insideTx = false;
          }
        });
      faceEmbedder.embed = jest.fn(async () => {
        expect(insideTx).toBe(false);
        return Float32Array.from([0.1, 0.2, 0.3]);
      });
      crypto.encrypt = jest.fn((v: string) => {
        expect(insideTx).toBe(false);
        return `enc(${v})`;
      });
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob/face/a1.jpg');

      await service.recordFaceEnrolment(session, {
        status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: true,
      });

      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(3);
      expect(faceEmbedder.embed).toHaveBeenCalledTimes(1);
      expect(crypto.encrypt).toHaveBeenCalledTimes(1);
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

    // webcam and browser_activity are both strike pauses cleared by the same acknowledgement;
    // screen_share is a precondition, only clearable by actually sharing again through
    // screenShareState's active:true path -- letting this endpoint clear it would let a
    // candidate wave away a still-unmet "must be sharing" requirement without ever sharing.
    it('rejects resuming an attempt paused for screen_share', async () => {
      const attempt = { id: 'attempt-1', status: 'paused', pausedReason: 'screen_share' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      mockBootstrapThenScoped(tx);

      await expect(service.webcamResume(session)).rejects.toThrow(BadRequestException);
      expect(settlement.resumeFromPause).not.toHaveBeenCalled();
    });

    it('still resumes an attempt paused for webcam', async () => {
      const attempt = { id: 'attempt-1', status: 'paused', pausedReason: 'webcam' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      mockBootstrapThenScoped(tx);
      settlement.resumeFromPause = jest.fn().mockResolvedValue({ ...attempt, status: 'in_progress' });

      const result = await service.webcamResume(session);

      expect(result).toEqual({ status: 'in_progress' });
    });
  });

  describe('screenShareState', () => {
    const examWithScreenCapture = { ...exam, screenCaptureEnabled: true };
    const examWithoutScreenCapture = { ...exam, screenCaptureEnabled: false };

    function mockScoped(exam: unknown, tx: unknown) {
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam }))
        .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));
    }

    it('writes nothing and returns the current status unchanged when the exam has screenCaptureEnabled false', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', screenShareStartedAt: null };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt), update: jest.fn() },
        proctoringEvent: { create: jest.fn() },
      };
      mockScoped(examWithoutScreenCapture, tx);

      const result = await service.screenShareState(session, { active: false });

      expect(result).toEqual({ status: 'in_progress' });
      expect(tx.attempt.update).not.toHaveBeenCalled();
      expect(tx.proctoringEvent.create).not.toHaveBeenCalled();
      expect(settlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
      expect(settlement.resumeFromPause).not.toHaveBeenCalled();
      expect(monitoringGateway.emitAttemptStatus).not.toHaveBeenCalled();
    });

    it('pauses and records no strike when active:false arrives and sharing never started (arriving is not a violation)', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', screenShareStartedAt: null };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue({ ...attempt, status: 'paused', pausedAt: new Date() }),
        },
      };
      mockScoped(examWithScreenCapture, tx);

      const result = await service.screenShareState(session, { active: false });

      expect(settlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
      expect(tx.attempt.update).toHaveBeenCalledTimes(1);
      expect(tx.attempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { status: 'paused', pausedAt: expect.any(Date), pausedReason: 'screen_share' } });
      expect(monitoringGateway.emitAttemptStatus).toHaveBeenCalledWith('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', status: 'paused' });
      expect(result).toEqual({ status: 'paused' });
    });

    it('records screen_share_stopped through registerBrowserActivityViolation and strikes when a share was running', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', screenShareStartedAt: new Date('2026-01-01T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue({ ...attempt, status: 'paused', screenShareStartedAt: null, browserActivityViolationCount: 1 }),
        },
      };
      mockScoped(examWithScreenCapture, tx);
      settlement.registerBrowserActivityViolation.mockResolvedValue({
        attempt: { ...attempt, status: 'paused', browserActivityViolationCount: 1 },
        strike: 1,
        event: { id: 'evt-1', eventType: 'screen_share_stopped', severity: 'high' },
      });

      const result = await service.screenShareState(session, { active: false, displaySurface: 'monitor', userAgent: 'Mozilla' });

      expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(
        tx,
        examWithScreenCapture,
        attempt,
        'screen_share_stopped',
        { displaySurface: 'monitor', userAgent: 'Mozilla' },
      );
      expect(tx.attempt.update).toHaveBeenCalledTimes(1);
      expect(tx.attempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { screenShareStartedAt: null } });
      expect(result).toEqual({ status: 'paused' });
    });

    it("pauses without striking when reason:'absent' arrives while a share was running (a refresh can't survive navigation), but still records a low-severity trace event", async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', screenShareStartedAt: new Date('2026-01-01T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest
            .fn()
            .mockResolvedValueOnce({ ...attempt, screenShareStartedAt: null })
            .mockResolvedValueOnce({ ...attempt, screenShareStartedAt: null, status: 'paused' }),
        },
        proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'screen_share_stopped', severity: 'low' }) },
      };
      mockScoped(examWithScreenCapture, tx);

      const result = await service.screenShareState(session, { active: false, reason: 'absent' });

      expect(settlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
      // registerBrowserActivityViolation is the only other writer of screen_share_stopped --
      // skipping it to skip the strike must not also skip the audit trail (a tampered client
      // that always sends 'absent' would otherwise stop sharing with zero trace in the log).
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: {
          attemptId: 'attempt-1',
          eventType: 'screen_share_stopped',
          severity: 'low',
          metadataJson: JSON.stringify({ reason: 'absent' }),
        },
      });
      expect(tx.attempt.update).toHaveBeenNthCalledWith(1, { where: { id: 'attempt-1' }, data: { screenShareStartedAt: null } });
      expect(tx.attempt.update).toHaveBeenNthCalledWith(2, { where: { id: 'attempt-1' }, data: { status: 'paused', pausedAt: expect.any(Date), pausedReason: 'screen_share' } });
      expect(result).toEqual({ status: 'paused' });
    });

    it("strikes when reason:'ended' arrives while a share was running, same as an omitted reason", async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', screenShareStartedAt: new Date('2026-01-01T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue({ ...attempt, status: 'paused', screenShareStartedAt: null, browserActivityViolationCount: 1 }),
        },
      };
      mockScoped(examWithScreenCapture, tx);
      settlement.registerBrowserActivityViolation.mockResolvedValue({
        attempt: { ...attempt, status: 'paused', browserActivityViolationCount: 1 },
        strike: 1,
        event: { id: 'evt-1', eventType: 'screen_share_stopped', severity: 'high' },
      });

      const result = await service.screenShareState(session, { active: false, reason: 'ended' });

      // No displaySurface/userAgent supplied -- shareMetadata is undefined, not the always-
      // truthy { displaySurface: undefined, userAgent: undefined } literal (see the
      // metadataJson: null test below for why that distinction matters).
      expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(
        tx,
        examWithScreenCapture,
        attempt,
        'screen_share_stopped',
        undefined,
      );
      expect(result).toEqual({ status: 'paused' });
    });

    it('leaves a blocked attempt blocked -- the state machine never downgrades blocked to paused', async () => {
      const attempt = { id: 'attempt-1', status: 'blocked', screenShareStartedAt: new Date('2026-01-01T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue({ ...attempt, screenShareStartedAt: null }),
        },
      };
      mockScoped(examWithScreenCapture, tx);
      settlement.registerBrowserActivityViolation.mockResolvedValue({
        attempt: { ...attempt },
        strike: 3,
        event: { id: 'evt-1', eventType: 'screen_share_stopped', severity: 'high' },
      });

      const result = await service.screenShareState(session, { active: false });

      expect(tx.attempt.update).toHaveBeenCalledTimes(1);
      expect(monitoringGateway.emitAttemptStatus).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'blocked' });
    });

    it('skips the pause entirely on a bypassed attempt, while still recording the strike', async () => {
      const attempt = {
        id: 'attempt-1',
        status: 'in_progress',
        screenShareStartedAt: new Date('2026-01-01T00:00:00Z'),
        proctoringBypassedAt: new Date('2026-01-01T00:00:00Z'),
        proctoringBypassRevokedAt: null,
      };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue({ ...attempt, screenShareStartedAt: null, browserActivityViolationCount: 1 }),
        },
      };
      mockScoped(examWithScreenCapture, tx);
      settlement.registerBrowserActivityViolation.mockResolvedValue({
        attempt: { ...attempt, browserActivityViolationCount: 1 },
        strike: 1,
        event: { id: 'evt-1', eventType: 'screen_share_stopped', severity: 'high' },
      });

      const result = await service.screenShareState(session, { active: false });

      expect(settlement.registerBrowserActivityViolation).toHaveBeenCalled();
      expect(tx.attempt.update).toHaveBeenCalledTimes(1);
      expect(monitoringGateway.emitAttemptStatus).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'in_progress' });
    });

    it('sets the timestamp, records screen_share_started, and resumes without resetting violation counters', async () => {
      const attempt = { id: 'attempt-1', status: 'paused', screenShareStartedAt: null, browserActivityViolationCount: 2 };
      const startedAttempt = { ...attempt, screenShareStartedAt: new Date('2026-07-26T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue(startedAttempt),
        },
        proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'screen_share_started', severity: 'low' }) },
      };
      mockScoped(examWithScreenCapture, tx);
      settlement.resumeFromPause.mockResolvedValue({ ...startedAttempt, status: 'in_progress' });

      const result = await service.screenShareState(session, { active: true, displaySurface: 'monitor', userAgent: 'Mozilla' });

      expect(tx.attempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { screenShareStartedAt: expect.any(Date) } });
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: {
          attemptId: 'attempt-1',
          eventType: 'screen_share_started',
          severity: getProctoringEventSeverity('screen_share_started'),
          metadataJson: JSON.stringify({ displaySurface: 'monitor', userAgent: 'Mozilla' }),
        },
      });
      expect(settlement.resumeFromPause).toHaveBeenCalledWith(tx, startedAttempt);
      expect(result).toEqual({ status: 'in_progress' });
    });

    it('writes metadataJson: null (not "{}") for screen_share_started when displaySurface/userAgent are both absent', async () => {
      // { displaySurface: undefined, userAgent: undefined } is a non-null object literal --
      // always truthy -- so building it unconditionally and only null-checking the object
      // itself lets JSON.stringify silently drop the undefined-valued keys and write "{}"
      // instead of null, unlike every other metadata-less event.
      const attempt = { id: 'attempt-1', status: 'paused', screenShareStartedAt: null, browserActivityViolationCount: 0 };
      const startedAttempt = { ...attempt, screenShareStartedAt: new Date('2026-07-26T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue(startedAttempt),
        },
        proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'screen_share_started', severity: 'low' }) },
      };
      mockScoped(examWithScreenCapture, tx);
      settlement.resumeFromPause.mockResolvedValue({ ...startedAttempt, status: 'in_progress' });

      await service.screenShareState(session, { active: true });

      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: {
          attemptId: 'attempt-1',
          eventType: 'screen_share_started',
          severity: getProctoringEventSeverity('screen_share_started'),
          metadataJson: null,
        },
      });
    });

    it('writes metadataJson: null (not "{}") for screen_share_stopped when displaySurface/userAgent are both absent', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', screenShareStartedAt: new Date('2026-01-01T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue({ ...attempt, status: 'paused', screenShareStartedAt: null, browserActivityViolationCount: 1 }),
        },
      };
      mockScoped(examWithScreenCapture, tx);
      settlement.registerBrowserActivityViolation.mockResolvedValue({
        attempt: { ...attempt, status: 'paused', browserActivityViolationCount: 1 },
        strike: 1,
        event: { id: 'evt-1', eventType: 'screen_share_stopped', severity: 'high' },
      });

      await service.screenShareState(session, { active: false, reason: 'ended' });

      expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledWith(tx, examWithScreenCapture, attempt, 'screen_share_stopped', undefined);
    });

    it('no longer drops displaySurface/userAgent metadata that used to fold to the cap-count literal -- writes it through as-is (task 6804: that serialized-text guard is gone)', async () => {
      // displaySurface/userAgent are client-controlled free text written directly here, not
      // through reportProctoringEvent's dto.metadata -- this write site goes through the same
      // sanitizeMetadataOrDrop (see sanitize-metadata.ts). Fullwidth quote/colon (U+FF02/U+FF1A)
      // used to fold to ASCII under the now-deleted NFKC literal check; with that check gone and
      // no forged key present, this value passes through untouched.
      const attempt = { id: 'attempt-1', status: 'paused', screenShareStartedAt: null, browserActivityViolationCount: 2 };
      const startedAttempt = { ...attempt, screenShareStartedAt: new Date('2026-07-26T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue(startedAttempt),
        },
        proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'screen_share_started', severity: 'low' }) },
      };
      mockScoped(examWithScreenCapture, tx);
      settlement.resumeFromPause.mockResolvedValue({ ...startedAttempt, status: 'in_progress' });

      await service.screenShareState(session, { active: true, displaySurface: '＂screenshot＂：', userAgent: 'Mozilla' });

      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: {
          attemptId: 'attempt-1',
          eventType: 'screen_share_started',
          severity: getProctoringEventSeverity('screen_share_started'),
          metadataJson: JSON.stringify({ displaySurface: '＂screenshot＂：', userAgent: 'Mozilla' }),
        },
      });
    });

    it('does not resume a blocked attempt on active:true -- still records screen_share_started, but stays blocked', async () => {
      const attempt = { id: 'attempt-1', status: 'blocked', screenShareStartedAt: null };
      const startedAttempt = { ...attempt, screenShareStartedAt: new Date('2026-07-26T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue(startedAttempt),
        },
        proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
      };
      mockScoped(examWithScreenCapture, tx);

      const result = await service.screenShareState(session, { active: true, displaySurface: 'monitor', userAgent: 'Mozilla' });

      expect(tx.attempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { screenShareStartedAt: expect.any(Date) } });
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: {
          attemptId: 'attempt-1',
          eventType: 'screen_share_started',
          severity: getProctoringEventSeverity('screen_share_started'),
          metadataJson: JSON.stringify({ displaySurface: 'monitor', userAgent: 'Mozilla' }),
        },
      });
      expect(settlement.resumeFromPause).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'blocked' });
    });

    it('leaves an in_progress attempt in_progress on active:true -- resume only applies from paused, no spurious side effects', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', screenShareStartedAt: null };
      const startedAttempt = { ...attempt, screenShareStartedAt: new Date('2026-07-26T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn().mockResolvedValue(startedAttempt),
        },
        proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
      };
      mockScoped(examWithScreenCapture, tx);

      const result = await service.screenShareState(session, { active: true });

      expect(settlement.resumeFromPause).not.toHaveBeenCalled();
      expect(monitoringGateway.emitAttemptStatus).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'in_progress' });
    });

    // Regression coverage for the reason-blind resume defect: before pausedReason existed,
    // active:true resumed ANY paused attempt, so a candidate paused for a webcam violation could
    // be shown "share your screen", share, and have the webcam pause cleared without the webcam
    // condition ever being satisfied.
    it.each(['webcam', 'browser_activity'] as const)(
      'does not resume a pause owned by %s on active:true -- only a screen_share (or legacy null) owner may be cleared this way',
      async (pausedReason) => {
        const attempt = { id: 'attempt-1', status: 'paused', screenShareStartedAt: null, pausedReason };
        const tx = {
          attempt: {
            findUnique: jest.fn().mockResolvedValue(attempt),
            update: jest.fn().mockResolvedValue({ ...attempt, screenShareStartedAt: new Date('2026-07-26T00:00:00Z') }),
          },
          proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        mockScoped(examWithScreenCapture, tx);

        const result = await service.screenShareState(session, { active: true });

        expect(settlement.resumeFromPause).not.toHaveBeenCalled();
        expect(result).toEqual({ status: 'paused' });
      },
    );

    it('is idempotent across repeated active:true calls -- second call does not re-write the timestamp or double-record the event', async () => {
      const initialAttempt = { id: 'attempt-1', status: 'paused', screenShareStartedAt: null };
      const startedAttempt = { ...initialAttempt, screenShareStartedAt: new Date('2026-07-26T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValueOnce(initialAttempt).mockResolvedValueOnce(startedAttempt),
          update: jest.fn().mockResolvedValue(startedAttempt),
        },
        proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examWithScreenCapture }))
        .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx))
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examWithScreenCapture }))
        .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));
      settlement.resumeFromPause.mockResolvedValue({ ...startedAttempt, status: 'in_progress' });

      await service.screenShareState(session, { active: true });
      expect(tx.attempt.update).toHaveBeenCalledTimes(1);
      expect(tx.proctoringEvent.create).toHaveBeenCalledTimes(1);

      const secondResult = await service.screenShareState(session, { active: true });
      expect(tx.attempt.update).toHaveBeenCalledTimes(1);
      expect(tx.proctoringEvent.create).toHaveBeenCalledTimes(1);
      expect(settlement.resumeFromPause).toHaveBeenCalledTimes(2);
      expect(secondResult).toEqual({ status: 'in_progress' });
    });

    it('is idempotent across repeated active:false calls -- second call does not double-strike, double-record, or double-pause', async () => {
      const runningAttempt = { id: 'attempt-1', status: 'in_progress', screenShareStartedAt: new Date('2026-01-01T00:00:00Z') };
      const stoppedAttempt = { ...runningAttempt, status: 'paused', screenShareStartedAt: null };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValueOnce(runningAttempt).mockResolvedValueOnce(stoppedAttempt),
          update: jest.fn().mockResolvedValue(stoppedAttempt),
        },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examWithScreenCapture }))
        .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx))
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: examWithScreenCapture }))
        .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));
      settlement.registerBrowserActivityViolation.mockResolvedValue({
        attempt: { ...runningAttempt, status: 'paused', browserActivityViolationCount: 1 },
        strike: 1,
        event: { id: 'evt-1', eventType: 'screen_share_stopped', severity: 'high' },
      });

      await service.screenShareState(session, { active: false });
      expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledTimes(1);
      expect(tx.attempt.update).toHaveBeenCalledTimes(1);

      const secondResult = await service.screenShareState(session, { active: false });
      expect(settlement.registerBrowserActivityViolation).toHaveBeenCalledTimes(1);
      expect(tx.attempt.update).toHaveBeenCalledTimes(1);
      expect(secondResult).toEqual({ status: 'paused' });
    });

    it('throws NotFoundException when no attempt has been started', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockScoped(examWithScreenCapture, tx);

      await expect(service.screenShareState(session, { active: true })).rejects.toThrow(NotFoundException);
    });

    it('leaves a submitted attempt untouched on active:false -- no strike, no event, no writes at all', async () => {
      const attempt = { id: 'attempt-1', status: 'submitted', screenShareStartedAt: new Date('2026-01-01T00:00:00Z') };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt), update: jest.fn() },
        proctoringEvent: { create: jest.fn() },
      };
      mockScoped(examWithScreenCapture, tx);

      const result = await service.screenShareState(session, { active: false });

      expect(settlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
      expect(tx.attempt.update).not.toHaveBeenCalled();
      expect(tx.proctoringEvent.create).not.toHaveBeenCalled();
      expect(monitoringGateway.emitAttemptStatus).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'submitted' });
    });

    it('leaves a submitted attempt untouched on active:true -- no timestamp, no event, no writes at all', async () => {
      const attempt = { id: 'attempt-1', status: 'submitted', screenShareStartedAt: null };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt), update: jest.fn() },
        proctoringEvent: { create: jest.fn() },
      };
      mockScoped(examWithScreenCapture, tx);

      const result = await service.screenShareState(session, { active: true });

      expect(tx.attempt.update).not.toHaveBeenCalled();
      expect(tx.proctoringEvent.create).not.toHaveBeenCalled();
      expect(settlement.resumeFromPause).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'submitted' });
    });

    it('pauses under warn-mode enforcement -- the missing-share pause is a precondition, not enforcement', async () => {
      const warnExam = { ...examWithScreenCapture, proctoringEnforcement: 'warn' };
      const attempt = { id: 'attempt-1', status: 'in_progress', screenShareStartedAt: new Date('2026-01-01T00:00:00Z') };
      const tx = {
        attempt: {
          findUnique: jest.fn().mockResolvedValue(attempt),
          update: jest.fn()
            .mockResolvedValueOnce({ ...attempt, screenShareStartedAt: null, browserActivityViolationCount: 1 })
            .mockResolvedValueOnce({ ...attempt, screenShareStartedAt: null, browserActivityViolationCount: 1, status: 'paused', pausedAt: new Date() }),
        },
      };
      mockScoped(warnExam, tx);
      // Warn-mode enforcement: registerBrowserActivityViolation itself never pauses/blocks,
      // so it hands back the attempt with status unchanged (still in_progress).
      settlement.registerBrowserActivityViolation.mockResolvedValue({
        attempt: { ...attempt, status: 'in_progress', browserActivityViolationCount: 1 },
        strike: 1,
        event: { id: 'evt-1', eventType: 'screen_share_stopped', severity: 'high' },
      });

      const result = await service.screenShareState(session, { active: false });

      expect(tx.attempt.update).toHaveBeenCalledTimes(2);
      expect(tx.attempt.update).toHaveBeenNthCalledWith(2, { where: { id: 'attempt-1' }, data: { status: 'paused', pausedAt: expect.any(Date), pausedReason: 'screen_share' } });
      expect(monitoringGateway.emitAttemptStatus).toHaveBeenCalledWith('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', status: 'paused' });
      expect(result).toEqual({ status: 'paused' });
    });
  });
  describe('SEB lockdown', () => {
    const lockdownExam = { ...exam, lockdownRequired: true, screenCaptureEnabled: true };
    const lockdownInvitation = { ...invitationRecord, token: 'tok-1', exam: lockdownExam };

    it('rejects start when the exam requires SEB and the ConfigKey header is absent', async () => {
      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(lockdownInvitation));

      await expect(
        service.start({ invitationId: 'inv-1' }, { consent: true }, '', {
          configKeyHash: undefined,
          requestUrl: 'https://runtime.test/api/v1/attempt/start',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects start when the ConfigKey header does not match our config', async () => {
      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(lockdownInvitation));

      await expect(
        service.start({ invitationId: 'inv-1' }, { consent: true }, '', {
          configKeyHash: 'f'.repeat(64),
          requestUrl: 'https://runtime.test/api/v1/attempt/start',
        }),
      ).rejects.toThrow(/Safe Exam Browser/);
    });

    it('allows start when the ConfigKey hash matches the config generated for this candidate', async () => {
      const requestUrl = 'https://runtime.test/api/v1/attempt/start';
      const { configKey } = buildSebConfig({ startUrl: 'http://localhost:3000/start?token=tok-1' });
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) } };
      mockBootstrapThenScoped(tx);
      tenantPrisma.forTenant.mockReset();
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(lockdownInvitation))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.start({ invitationId: 'inv-1' }, { consent: true }, '', {
        configKeyHash: requestConfigKeyHash(requestUrl, configKey),
        requestUrl,
      });

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
    });

    it('does not demand SEB when the exam has lockdown off', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) } };
      mockBootstrapThenScoped(tx);

      const result = await service.start({ invitationId: 'inv-1' }, { consent: true }, '', {
        configKeyHash: undefined,
        requestUrl: 'https://runtime.test/api/v1/attempt/start',
      });

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
    });

    it('serves the .seb config for a lockdown exam and refuses it otherwise', async () => {
      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(lockdownInvitation));
      const { plistXml } = await service.getSebConfig({ invitationId: 'inv-1' });
      expect(plistXml).toContain('<key>startURL</key>');
      expect(plistXml).toContain('token=tok-1');
      expect(plistXml).toContain('<string>anydesk</string>');

      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(invitationRecord));
      await expect(service.getSebConfig({ invitationId: 'inv-1' })).rejects.toThrow(/does not require/);
    });
  });

  describe('analyzeScreenCapture', () => {
    const SHOT = 'data:image/jpeg;base64,Zm9v';
    const examWithCapture = { ...exam, screenCaptureEnabled: true };
    const invitationWithCapture = { ...invitationRecord, exam: examWithCapture };
    const attemptFixture = () => ({
      id: 'attempt-1', status: 'in_progress', screenCaptureCount: 0,
      proctoringBypassedAt: null, proctoringBypassRevokedAt: null,
    });

    function scopedTxFor(attempt: unknown) {
      return {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt), update: jest.fn().mockResolvedValue({}) },
        aiCreditUsage: { create: jest.fn().mockResolvedValue({}) },
        proctoringEvent: {
          create: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({ id: 'event-1', occurredAt: new Date(), ...data }),
          ),
        },
      };
    }

    function mockBootstrapThenAllScoped(scopedTx: unknown, invitation: unknown = invitationWithCapture) {
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve(invitation))
        .mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(scopedTx));
    }

    it('skips without calling the AI when screen capture is not enabled on the exam', async () => {
      const tx = scopedTxFor(attemptFixture());
      mockBootstrapThenAllScoped(tx, invitationRecord); // exam without screenCaptureEnabled

      const result = await service.analyzeScreenCapture(session, { screenshot: SHOT });

      expect(result).toEqual({ status: 'skipped' });
      expect(aiApiKeyResolver.resolve).not.toHaveBeenCalled();
      expect(tx.proctoringEvent.create).not.toHaveBeenCalled();
    });

    it('skips when the org has no AI configured (resolver throws), without recording an event or credit', async () => {
      aiApiKeyResolver.resolve.mockRejectedValue(new Error('No AI API key configured'));
      const tx = scopedTxFor(attemptFixture());
      mockBootstrapThenAllScoped(tx);

      const result = await service.analyzeScreenCapture(session, { screenshot: SHOT });

      expect(result).toEqual({ status: 'skipped' });
      expect(tx.aiCreditUsage.create).not.toHaveBeenCalled();
      expect(tx.proctoringEvent.create).not.toHaveBeenCalled();
    });

    it('returns clear (and bills one credit) when the model sees no remote-access UI', async () => {
      generateStructured.mockResolvedValue({ remoteAccessVisible: false, toolName: 'none', reasoning: 'clean' });
      const tx = scopedTxFor(attemptFixture());
      mockBootstrapThenAllScoped(tx);

      const result = await service.analyzeScreenCapture(session, { screenshot: SHOT });

      expect(result).toEqual({ status: 'clear' });
      expect(generateStructured).toHaveBeenCalledWith(expect.objectContaining({ images: [SHOT], modelTier: 'fast' }));
      expect(tx.aiCreditUsage.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', source: 'screen_analysis', credits: 1, sourceId: 'attempt-1' },
      });
      expect(tx.proctoringEvent.create).not.toHaveBeenCalled();
      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
    });

    it('uploads the screenshot and records a high-severity remote_access_suspected event when flagged', async () => {
      generateStructured.mockResolvedValue({ remoteAccessVisible: true, toolName: 'AnyDesk', reasoning: 'AnyDesk toolbar top-right' });
      const tx = scopedTxFor(attemptFixture());
      mockBootstrapThenAllScoped(tx);

      const result = await service.analyzeScreenCapture(session, { screenshot: SHOT });

      expect(result).toEqual({ status: 'flagged' });
      expect(blobStorage.uploadDataUri).toHaveBeenCalledWith(expect.stringContaining('screen-captures/attempt-1-'), SHOT);
      const created = tx.proctoringEvent.create.mock.calls[0][0].data;
      expect(created.eventType).toBe('remote_access_suspected');
      expect(created.severity).toBe('high');
      const metadata = JSON.parse(created.metadataJson);
      expect(metadata.toolName).toBe('AnyDesk');
      expect(metadata.screenshot).toContain('screen-captures/attempt-1-');
      expect(monitoringGateway.emitProctoringFlag).toHaveBeenCalledWith(
        'exam-1',
        expect.objectContaining({ attemptId: 'attempt-1', eventType: 'remote_access_suspected', severity: 'high' }),
      );
      // The stored image counts against the same server-authoritative cap as violation captures.
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { screenCaptureCount: { increment: 1 } },
      });
    });

    it('records a medium-severity background_app_detected event when a messaging app (not remote access) is visible', async () => {
      generateStructured.mockResolvedValue({
        remoteAccessVisible: false,
        backgroundAppVisible: true,
        toolName: 'WhatsApp',
        reasoning: 'WhatsApp window open behind the exam',
      });
      const tx = scopedTxFor(attemptFixture());
      mockBootstrapThenAllScoped(tx);

      const result = await service.analyzeScreenCapture(session, { screenshot: SHOT });

      expect(result).toEqual({ status: 'flagged' });
      const created = tx.proctoringEvent.create.mock.calls[0][0].data;
      expect(created.eventType).toBe('background_app_detected');
      expect(created.severity).toBe('medium');
      expect(JSON.parse(created.metadataJson).toolName).toBe('WhatsApp');
    });

    it('prefers remote_access_suspected when both remote access and a background app are visible', async () => {
      generateStructured.mockResolvedValue({
        remoteAccessVisible: true,
        backgroundAppVisible: true,
        toolName: 'AnyDesk',
        reasoning: 'AnyDesk session bar and WhatsApp both visible',
      });
      const tx = scopedTxFor(attemptFixture());
      mockBootstrapThenAllScoped(tx);

      await service.analyzeScreenCapture(session, { screenshot: SHOT });

      expect(tx.proctoringEvent.create.mock.calls[0][0].data.eventType).toBe('remote_access_suspected');
    });

    it('enforces the server-side minimum interval between analyses of the same attempt', async () => {
      generateStructured.mockResolvedValue({ remoteAccessVisible: false, toolName: 'none', reasoning: 'clean' });
      const tx = scopedTxFor(attemptFixture());
      mockBootstrapThenAllScoped(tx);

      await service.analyzeScreenCapture(session, { screenshot: SHOT });
      tenantPrisma.forTenant.mockReset();
      mockBootstrapThenAllScoped(tx);
      const second = await service.analyzeScreenCapture(session, { screenshot: SHOT });

      expect(second).toEqual({ status: 'skipped' });
      expect(generateStructured).toHaveBeenCalledTimes(1);
    });
  });

  describe('reportClientError', () => {
    it('records a candidate-browser system event with attempt/candidate/exam context', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } };
      mockBootstrapThenScoped(tx);

      await service.reportClientError(session, { kind: 'answer_save_failed', message: 'network error', detail: 'q-3', severity: 'warn' });

      expect(systemEvents.record).toHaveBeenCalledWith({
        organizationId: 'org-1',
        service: 'candidate-browser',
        severity: 'warn',
        message: 'answer_save_failed: network error',
        context: { kind: 'answer_save_failed', attemptId: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', invitationId: 'inv-1', detail: 'q-3' },
      });
    });

    it('records with a null attemptId when the attempt has not started yet (welcome-page errors)', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenScoped(tx);

      await service.reportClientError(session, { kind: 'js_error', message: 'boom' });

      expect(systemEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', context: expect.objectContaining({ attemptId: null }) }),
      );
    });
  });
});
