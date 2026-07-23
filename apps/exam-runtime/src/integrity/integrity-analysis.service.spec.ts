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
    invitation: { exam: { organizationId: 'org-1', title: 'Backend Engineer Exam' } },
  };

  // Long enough (>= MIN_NORMALIZED_LENGTH = 150 after normalization) and identical between
  // "current" and "counterpart" so similarityScore() returns 1.0 without needing to fake the pure function.
  const LONG_CODE = 'function calculateSum(a, b) { return a + b; } '.repeat(6);

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    integrityNarrativeClient = { writeNarrative: jest.fn() };
    aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue('test-api-key') };
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
      'test-api-key',
    );
    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'completed', level: 'review', narrative: 'One webcam violation was recorded.' }),
      }),
    );
  });

  it('flagged path (high severity): webcam-blocked attempt derives high_concern level', async () => {
    const write = persistTx();
    tenantPrisma.forTenant
      .mockResolvedValueOnce({ ...attemptWithExam, webcamViolationCount: 3 })
      .mockImplementationOnce((_ctx, fn) => fn(readTxWith([])))
      .mockImplementationOnce((_ctx, fn) => fn(write));
    integrityNarrativeClient.writeNarrative.mockResolvedValue('Multiple webcam violations, session blocked.');

    await service.analyze('attempt-1');

    expect(integrityNarrativeClient.writeNarrative).toHaveBeenCalledWith(
      expect.any(Array),
      { examTitle: 'Backend Engineer Exam', level: 'high_concern' },
      'test-api-key',
    );
    expect(write.integrityAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ level: 'high_concern' }) }),
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
      'test-api-key',
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
});
