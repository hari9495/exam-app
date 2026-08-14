import { Test } from '@nestjs/testing';
import { IntegrityAnalysisService } from './integrity-analysis.service';
import { IntegrityNarrativeClient } from './integrity-narrative.client';
import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';

describe('IntegrityAnalysisService', () => {
  let service: IntegrityAnalysisService;
  let tenantPrisma: { forTenant: jest.Mock };
  let integrityNarrativeClient: { writeNarrative: jest.Mock };
  let aiApiKeyResolver: { resolve: jest.Mock };

  const attemptWithExam = {
    id: 'attempt-1',
    examId: 'exam-1',
    webcamViolationCount: 0,
    invitation: {
      exam: {
        organizationId: 'org-1',
        title: 'Backend Engineer Exam',
        // Schema defaults (apps/api/prisma/schema.prisma): anti-cheating on, webcam on, block enforcement, limit 3, no disabled signals.
        enableAntiCheating: true,
        webcamProctoringEnabled: true,
        webcamRecordOnly: false,
        proctoringEnforcement: 'block',
        proctoringStrikeLimit: 3,
        disabledProctoringSignalsJson: null,
      },
    },
  };

  // Long enough (>= MIN_NORMALIZED_LENGTH = 150 after normalization) and identical between
  // "current" and "counterpart" so similarityScore() returns 1.0 without needing to fake the pure function.
  const LONG_CODE = 'function calculateSum(a, b) { return a + b; } '.repeat(6);

  const fakeAiProvider = { generateStructured: jest.fn() };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    integrityNarrativeClient = { writeNarrative: jest.fn() };
    aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue(fakeAiProvider) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        IntegrityAnalysisService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: IntegrityNarrativeClient, useValue: integrityNarrativeClient },
        { provide: AiApiKeyResolverService, useValue: aiApiKeyResolver },
      ],
    }).compile();
    service = moduleRef.get(IntegrityAnalysisService);
  });

  function mockReadWrite(readTx: any, persistTx: any) {
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
  }

  function readTxWith(answers: any[], events: any[] = []) {
    return {
      answer: { findMany: jest.fn().mockResolvedValue(answers) },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
    };
  }

  function persistTx() {
    return { integrityAnalysis: { upsert: jest.fn() }, aiCreditUsage: { create: jest.fn() } };
  }

  // Shared scaffolding for tests that only vary the attempt's bypass fields, webcam
  // violation count and proctoring events, against the default exam config (block,
  // strike limit 3, webcam on). Returns exactly the fields persisted via the
  // integrityAnalysis.upsert `create` payload -- narrative, level and flagsJson.
  async function runAnalysisWith(overrides: {
    proctoringBypassedAt: Date | null;
    proctoringBypassReason: string | null;
    proctoringBypassRevokedAt?: Date | null;
    webcamViolationCount: number;
    events: { eventType: string; severity: string }[];
  }): Promise<{ narrative: string | null; level: string; flagsJson: string | null }> {
    const attempt = {
      ...attemptWithExam,
      webcamViolationCount: overrides.webcamViolationCount,
      proctoringBypassedAt: overrides.proctoringBypassedAt,
      proctoringBypassReason: overrides.proctoringBypassReason,
      proctoringBypassRevokedAt: overrides.proctoringBypassRevokedAt ?? null,
    };
    const write = persistTx();
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attempt)
      .mockImplementationOnce((_ctx: any, fn: any) => fn(readTxWith([], overrides.events)))
      .mockImplementationOnce((_ctx: any, fn: any) => fn(write));

    await service.analyze('attempt-1');

    const call = write.integrityAnalysis.upsert.mock.calls[0][0];
    return { narrative: call.create.narrative, level: call.create.level, flagsJson: call.create.flagsJson };
  }

  it('resolves without doing anything when the attempt cannot be found', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce(null);

    await expect(service.analyze('missing-attempt')).resolves.toBeUndefined();

    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    expect(integrityNarrativeClient.writeNarrative).not.toHaveBeenCalled();
  });

  it('never throws even if the bootstrap lookup itself rejects', async () => {
    tenantPrisma.forTenant.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();
  });

  it('zero-flag path: upserts a clear result without calling the AI resolver/client or recording credit', async () => {
    const readTx = readTxWith([]);
    const write = persistTx();
    mockReadWrite(readTx, write);

    await service.analyze('attempt-1');

    expect(aiApiKeyResolver.resolve).not.toHaveBeenCalled();
    expect(integrityNarrativeClient.writeNarrative).not.toHaveBeenCalled();
    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'completed', level: 'clear', flagsJson: '[]', narrative: 'No integrity concerns detected.' },
      update: {
        status: 'completed',
        level: 'clear',
        flagsJson: '[]',
        narrative: 'No integrity concerns detected.',
        analyzedAt: expect.any(Date),
      },
    });
    expect(write.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it('flagged path (medium severity): derives review level, calls writeNarrative, and persists its narrative', async () => {
    const write = persistTx();
    tenantPrisma.forTenant
      .mockResolvedValueOnce({ ...attemptWithExam, webcamViolationCount: 1 })
      .mockImplementationOnce((_ctx, fn) => fn(readTxWith([])))
      .mockImplementationOnce((_ctx, fn) => fn(write));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('One webcam violation was recorded.');

    await service.analyze('attempt-1');

    expect(integrityNarrativeClient.writeNarrative).toHaveBeenCalledWith(
      [{ type: 'webcam_violations', severity: 'medium', detail: '1 webcam violation(s) recorded' }],
      { examTitle: 'Backend Engineer Exam', level: 'review' },
      fakeAiProvider,
    );
    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'completed', level: 'review', narrative: 'One webcam violation was recorded.' }),
      }),
    );
  });

  it('flagged path (high severity, context-only): webcam-blocked attempt derives review, not high_concern', async () => {
    // Updated for Task 2 (evidence classification): webcam_violations is a context-class flag.
    // A blocked session with no other evidence says the proctor stopped the session, not that
    // the candidate's answer is suspect, so the level tops out at 'review' however high the
    // flag's own severity reads. Previously this asserted 'high_concern' -- that assertion
    // encoded the pre-fix rule that any high flag promotes the whole attempt.
    integrityNarrativeClient.writeNarrative.mockResolvedValue('Multiple webcam violations, session blocked.');

    const analysis = await runAnalysisWith({
      proctoringBypassedAt: null,
      proctoringBypassReason: null,
      webcamViolationCount: 3,
      events: [],
    });

    expect(integrityNarrativeClient.writeNarrative).toHaveBeenCalledWith(
      expect.any(Array),
      { examTitle: 'Backend Engineer Exam', level: 'review' },
      fakeAiProvider,
    );
    expect(analysis.level).toBe('review');
  });

  it('config-aware blocked flag: a higher strike limit (5) with only 3 violations is not blocked -- medium severity, no "session blocked" wording', async () => {
    const write = persistTx();
    const attempt = {
      ...attemptWithExam,
      webcamViolationCount: 3,
      invitation: { exam: { ...attemptWithExam.invitation.exam, proctoringStrikeLimit: 5 } },
    };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attempt)
      .mockImplementationOnce((_ctx, fn) => fn(readTxWith([])))
      .mockImplementationOnce((_ctx, fn) => fn(write));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('Some webcam violations were recorded.');

    await service.analyze('attempt-1');

    expect(integrityNarrativeClient.writeNarrative).toHaveBeenCalledWith(
      [{ type: 'webcam_violations', severity: 'medium', detail: '3 webcam violation(s) recorded' }],
      { examTitle: 'Backend Engineer Exam', level: 'review' },
      fakeAiProvider,
    );
    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ level: 'review' }) }),
    );
  });

  it('config-aware blocked flag: warn-mode exams are never blocked regardless of violation count -- medium severity, no "session blocked" wording', async () => {
    const write = persistTx();
    const attempt = {
      ...attemptWithExam,
      webcamViolationCount: 3,
      invitation: { exam: { ...attemptWithExam.invitation.exam, proctoringEnforcement: 'warn' } },
    };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attempt)
      .mockImplementationOnce((_ctx, fn) => fn(readTxWith([])))
      .mockImplementationOnce((_ctx, fn) => fn(write));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('Some webcam violations were recorded.');

    await service.analyze('attempt-1');

    expect(integrityNarrativeClient.writeNarrative).toHaveBeenCalledWith(
      [{ type: 'webcam_violations', severity: 'medium', detail: '3 webcam violation(s) recorded' }],
      { examTitle: 'Backend Engineer Exam', level: 'review' },
      fakeAiProvider,
    );
    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ level: 'review' }) }),
    );
  });

  it('config-aware blocked flag: webcamRecordOnly exams are never blocked regardless of violation count, even on block enforcement -- medium severity, no "session blocked" wording', async () => {
    const write = persistTx();
    const attempt = {
      ...attemptWithExam,
      webcamViolationCount: 3,
      invitation: { exam: { ...attemptWithExam.invitation.exam, webcamRecordOnly: true } },
    };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attempt)
      .mockImplementationOnce((_ctx, fn) => fn(readTxWith([])))
      .mockImplementationOnce((_ctx, fn) => fn(write));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('Some webcam violations were recorded.');

    await service.analyze('attempt-1');

    expect(integrityNarrativeClient.writeNarrative).toHaveBeenCalledWith(
      [{ type: 'webcam_violations', severity: 'medium', detail: '3 webcam violation(s) recorded' }],
      { examTitle: 'Backend Engineer Exam', level: 'review' },
      fakeAiProvider,
    );
    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ level: 'review' }) }),
    );
  });

  it('config-aware blocked flag: a default exam (block, limit 3) with 3 violations is blocked -- high severity flag, but level stops at review (context-only)', async () => {
    // Updated for Task 2: the flag itself still reads 'high' (severity is about the flag), but
    // webcam_violations is context-class, so with no other evidence the level is 'review'.
    integrityNarrativeClient.writeNarrative.mockResolvedValue('Multiple webcam violations, session blocked.');

    await runAnalysisWith({
      proctoringBypassedAt: null,
      proctoringBypassReason: null,
      webcamViolationCount: 3,
      events: [],
    });

    expect(integrityNarrativeClient.writeNarrative).toHaveBeenCalledWith(
      [{ type: 'webcam_violations', severity: 'high', detail: '3 webcam violation(s) recorded, session blocked' }],
      { examTitle: 'Backend Engineer Exam', level: 'review' },
      fakeAiProvider,
    );
  });

  it('AI-failure path: keeps flags + level, sets narrative to null, status stays completed, and records no credit', async () => {
    const write = persistTx();
    tenantPrisma.forTenant
      .mockResolvedValueOnce({ ...attemptWithExam, webcamViolationCount: 1 })
      .mockImplementationOnce((_ctx, fn) => fn(readTxWith([])))
      .mockImplementationOnce((_ctx, fn) => fn(write));
    integrityNarrativeClient.writeNarrative.mockRejectedValue(new Error('rate limited'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'completed', level: 'review', narrative: null }),
      }),
    );
    expect(write.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it('records AiCreditUsage with a flat 1 credit only when the narrative call succeeds', async () => {
    const write = persistTx();
    tenantPrisma.forTenant
      .mockResolvedValueOnce({ ...attemptWithExam, webcamViolationCount: 1 })
      .mockImplementationOnce((_ctx, fn) => fn(readTxWith([])))
      .mockImplementationOnce((_ctx, fn) => fn(write));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('One webcam violation.');

    await service.analyze('attempt-1');

    expect(write.aiCreditUsage.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', source: 'integrity_narrative', credits: 1, sourceId: 'attempt-1' },
    });
  });

  it('parses telemetryJson on code answers and derives telemetry flags', async () => {
    const answers = [
      {
        answerText: 'x'.repeat(10),
        marksAwarded: null,
        telemetryJson: JSON.stringify({
          keystrokeChars: 0,
          pastedChars: 0,
          pasteCount: 1,
          largestPasteChars: 250,
          secondsToFirstEdit: 5,
          activeSeconds: 60,
          runCount: 1,
        }),
        question: { id: 'q1', type: 'code', marks: 10 },
      },
    ];
    const write = persistTx();
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      .mockImplementationOnce((_ctx, fn) => fn(readTxWith(answers)))
      .mockImplementationOnce((_ctx, fn) => fn(write));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('A large paste was detected.');

    await service.analyze('attempt-1');

    expect(integrityNarrativeClient.writeNarrative).toHaveBeenCalledWith(
      [{ type: 'large_paste', severity: 'medium', detail: 'Pasted 250 characters in a single paste', questionId: 'q1' }],
      expect.anything(),
      fakeAiProvider,
    );
  });

  it('skips telemetry silently when telemetryJson is unparseable, never flagging or throwing', async () => {
    const answers = [
      {
        answerText: 'x'.repeat(10),
        marksAwarded: null,
        telemetryJson: '{not-json',
        question: { id: 'q1', type: 'code', marks: 10 },
      },
    ];
    const write = persistTx();
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      .mockImplementationOnce((_ctx, fn) => fn(readTxWith(answers)))
      .mockImplementationOnce((_ctx, fn) => fn(write));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(integrityNarrativeClient.writeNarrative).not.toHaveBeenCalled();
    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ level: 'clear', flagsJson: '[]' }) }),
    );
  });

  it('similarity: flags a match against a counterpart attempt and updates the counterpart analysis with a re-derived level', async () => {
    const currentAnswer = {
      answerText: LONG_CODE,
      marksAwarded: null,
      telemetryJson: null,
      question: { id: 'q1', type: 'code', marks: 10 },
    };
    const counterpartAnswer = { answerText: LONG_CODE, attempt: { id: 'attempt-2' } };
    const readTx = {
      answer: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([currentAnswer]) // this attempt's own answers
          .mockResolvedValueOnce([counterpartAnswer]), // counterpart lookup for q1
      },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const write = persistTx();
    const counterpartTx = {
      integrityAnalysis: {
        findUnique: jest.fn().mockResolvedValue({ flagsJson: '[]' }),
        update: jest.fn(),
      },
    };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(write))
      .mockImplementationOnce((_ctx, fn) => fn(counterpartTx));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('High code similarity detected with another candidate.');

    await service.analyze('attempt-1');

    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          level: 'high_concern',
          flagsJson: JSON.stringify([
            {
              type: 'similarity_match',
              severity: 'high',
              detail: "Code is 100% similar to another candidate's submission for this question",
              questionId: 'q1',
              counterpartAttemptId: 'attempt-2',
              similarity: 1,
            },
          ]),
        }),
      }),
    );
    expect(counterpartTx.integrityAnalysis.update).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-2' },
      data: {
        flagsJson: JSON.stringify([
          {
            type: 'similarity_match',
            severity: 'high',
            detail: "Code is 100% similar to another candidate's submission for this question",
            questionId: 'q1',
            counterpartAttemptId: 'attempt-1',
            similarity: 1,
          },
        ]),
        level: 'high_concern',
        narrative: null,
      },
    });
  });

  it('similarity: nulls out a counterpart\'s narrative even when the counterpart previously had a non-null narrative, since it no longer reflects the added flag', async () => {
    const currentAnswer = {
      answerText: LONG_CODE,
      marksAwarded: null,
      telemetryJson: null,
      question: { id: 'q1', type: 'code', marks: 10 },
    };
    const counterpartAnswer = { answerText: LONG_CODE, attempt: { id: 'attempt-2' } };
    const readTx = {
      answer: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([currentAnswer])
          .mockResolvedValueOnce([counterpartAnswer]),
      },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const write = persistTx();
    const counterpartTx = {
      integrityAnalysis: {
        findUnique: jest.fn().mockResolvedValue({
          flagsJson: '[]',
          narrative: 'No integrity concerns detected.',
        }),
        update: jest.fn(),
      },
    };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(write))
      .mockImplementationOnce((_ctx, fn) => fn(counterpartTx));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('High code similarity detected with another candidate.');

    await service.analyze('attempt-1');

    expect(counterpartTx.integrityAnalysis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ narrative: null }) }),
    );
  });

  it('similarity: skips the counterpart update silently when the counterpart has no analysis yet', async () => {
    const currentAnswer = {
      answerText: LONG_CODE,
      marksAwarded: null,
      telemetryJson: null,
      question: { id: 'q1', type: 'code', marks: 10 },
    };
    const counterpartAnswer = { answerText: LONG_CODE, attempt: { id: 'attempt-2' } };
    const readTx = {
      answer: {
        findMany: jest.fn().mockResolvedValueOnce([currentAnswer]).mockResolvedValueOnce([counterpartAnswer]),
      },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const write = persistTx();
    const counterpartTx = { integrityAnalysis: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(write))
      .mockImplementationOnce((_ctx, fn) => fn(counterpartTx));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('High code similarity detected with another candidate.');

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(counterpartTx.integrityAnalysis.update).not.toHaveBeenCalled();
  });

  it('similarity: a counterpart-update failure is caught and does not reject analyze()', async () => {
    const currentAnswer = {
      answerText: LONG_CODE,
      marksAwarded: null,
      telemetryJson: null,
      question: { id: 'q1', type: 'code', marks: 10 },
    };
    const counterpartAnswer = { answerText: LONG_CODE, attempt: { id: 'attempt-2' } };
    const readTx = {
      answer: {
        findMany: jest.fn().mockResolvedValueOnce([currentAnswer]).mockResolvedValueOnce([counterpartAnswer]),
      },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const write = persistTx();
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(write))
      .mockImplementationOnce(() => Promise.reject(new Error('counterpart tx unavailable')));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('High code similarity detected with another candidate.');

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();
    expect(write.integrityAnalysis.upsert).toHaveBeenCalled();
  });

  describe('bypass disclosure', () => {
    it('prepends a disclosure to the clear narrative when no flags were raised', async () => {
      const analysis = await runAnalysisWith({
        proctoringBypassedAt: new Date('2026-07-26T10:30:00.000Z'),
        proctoringBypassReason: 'webcam driver crashing',
        webcamViolationCount: 0,
        events: [],
      });

      // "Recruiter note: " prefix (F6.2) marks the sentence as human-authored, since the
      // report renders the disclosure and the AI narrative as one collapsed paragraph.
      expect(analysis.narrative).toContain('Recruiter note: proctoring enforcement was relaxed by a recruiter');
      expect(analysis.narrative).toContain('webcam driver crashing');
    });

    it('leaves the integrity level untouched, so a bypass never penalises the candidate', async () => {
      const analysis = await runAnalysisWith({
        proctoringBypassedAt: new Date('2026-07-26T10:30:00.000Z'),
        proctoringBypassReason: 'flaky wifi',
        webcamViolationCount: 0,
        events: [],
      });

      expect(analysis.level).toBe('clear');
      expect(JSON.parse(analysis.flagsJson ?? '[]')).toEqual([]);
    });

    it('adds no disclosure when the attempt was never bypassed', async () => {
      const analysis = await runAnalysisWith({
        proctoringBypassedAt: null,
        proctoringBypassReason: null,
        webcamViolationCount: 0,
        events: [],
      });

      expect(analysis.narrative).not.toContain('relaxed by a recruiter');
    });

    it('still discloses a bypass that was later revoked, and states the window it covered', async () => {
      // Without this, revoke would erase the disclosure while its counter reset stands --
      // a bypassed-then-revoked attempt would report quieter than one never bypassed.
      const analysis = await runAnalysisWith({
        proctoringBypassedAt: new Date('2026-07-26T10:30:00.000Z'),
        proctoringBypassReason: 'webcam driver crashing',
        proctoringBypassRevokedAt: new Date('2026-07-26T11:15:00.000Z'),
        webcamViolationCount: 0,
        events: [],
      });

      expect(analysis.narrative).toContain('Recruiter note: proctoring enforcement was relaxed by a recruiter');
      expect(analysis.narrative).toContain('from 2026-07-26T10:30:00.000Z until 2026-07-26T11:15:00.000Z');
    });

    it('states that a never-revoked bypass covered the rest of the attempt', async () => {
      const analysis = await runAnalysisWith({
        proctoringBypassedAt: new Date('2026-07-26T10:30:00.000Z'),
        proctoringBypassReason: 'flaky wifi',
        proctoringBypassRevokedAt: null,
        webcamViolationCount: 0,
        events: [],
      });

      expect(analysis.narrative).toContain('for the remainder of the attempt');
    });

    it('does not report a block when enforcement was bypassed past the strike limit', async () => {
      const analysis = await runAnalysisWith({
        proctoringBypassedAt: new Date('2026-07-26T10:30:00.000Z'),
        proctoringBypassReason: 'driver crash',
        webcamViolationCount: 9,
        events: [],
      });

      const flags = JSON.parse(analysis.flagsJson ?? '[]') as { type: string; detail: string }[];
      const webcamFlag = flags.find((flag) => flag.type === 'webcam_violations');
      expect(webcamFlag?.detail).not.toContain('session blocked');
    });
  });
});
