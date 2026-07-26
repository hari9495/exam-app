import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { ReportsService } from './reports.service';
import { TenantPrismaService, BlobStorageService } from '@exam-platform/shared';
import { ExamsService, ExamResultRow } from '../exams/exams.service';

// Only BlobServiceClient.fromConnectionString is faked below (real-BlobStorageService nested
// describe) -- ContainerClient/StorageSharedKeyCredential stay the real SDK classes, same
// pattern as packages/shared/src/storage/blob-storage.service.spec.ts.
jest.mock('@azure/storage-blob', () => {
  const actual = jest.requireActual('@azure/storage-blob');
  return { ...actual, BlobServiceClient: { fromConnectionString: jest.fn() } };
});

describe('ReportsService', () => {
  let service: ReportsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let examsService: { getResults: jest.Mock };
  let blobStorage: { signIfOurs: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    examsService = { getResults: jest.fn() };
    // Identity pass-through by default -- signing behaviour itself is covered end to end below
    // and in packages/shared/src/storage/blob-storage.service.spec.ts.
    blobStorage = { signIfOurs: jest.fn(async (value) => value) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ExamsService, useValue: examsService },
        { provide: BlobStorageService, useValue: blobStorage },
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  function row(overrides: Partial<ExamResultRow>): ExamResultRow {
    return {
      candidateId: 'cand-1',
      candidateName: 'Candidate',
      invitationId: 'inv-1',
      attemptId: null,
      status: 'invited',
      score: null,
      maxScore: null,
      percentage: null,
      passFail: null,
      submittedAt: null,
      proctoringAnalysis: null,
      integrityAnalysis: null,
      integrityLevel: null,
      integrityFlagCount: 0,
      ...overrides,
    };
  }

  describe('getSummary', () => {
    it('classifies candidates into settled (all 3 terminal statuses)/in-progress/not-started buckets', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1', percentage: 80, passFail: 'pass' }),
        row({ status: 'auto_submitted', attemptId: 'a2', percentage: 40, passFail: 'fail' }),
        row({ status: 'force_submitted', attemptId: 'a3', percentage: 60, passFail: 'pass' }),
        row({ status: 'in_progress', attemptId: 'a4' }),
        row({ status: 'invited' }),
      ]);
      tenantPrisma.forTenant.mockResolvedValue([]);

      const summary = await service.getSummary(context, 'exam-1');

      expect(summary.totalCandidates).toBe(5);
      expect(summary.settledCount).toBe(3);
      expect(summary.inProgressCount).toBe(1);
      expect(summary.notStartedCount).toBe(1);
    });

    it('computes pass rate, average percentage, and score distribution from settled rows only', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1', percentage: 80, passFail: 'pass' }),
        row({ status: 'submitted', attemptId: 'a2', percentage: 40, passFail: 'fail' }),
        row({ status: 'in_progress', attemptId: 'a3' }),
      ]);
      tenantPrisma.forTenant.mockResolvedValue([]);

      const summary = await service.getSummary(context, 'exam-1');

      expect(summary.passRate).toBe(50);
      expect(summary.averagePercentage).toBe(60);
      expect(summary.scoreDistribution).toEqual([
        { rangeLabel: '0-20', count: 0 },
        { rangeLabel: '20-40', count: 0 },
        { rangeLabel: '40-60', count: 1 },
        { rangeLabel: '60-80', count: 0 },
        { rangeLabel: '80-100', count: 1 },
      ]);
    });

    it('computes attempt duration avg/min/max from startedAt/submittedAt across settled attempts', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1', percentage: 50, passFail: 'fail', submittedAt: new Date('2026-01-01T00:30:00Z') }),
        row({ status: 'submitted', attemptId: 'a2', percentage: 90, passFail: 'pass', submittedAt: new Date('2026-01-01T01:10:00Z') }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', startedAt: new Date('2026-01-01T00:00:00Z') },
            { id: 'a2', startedAt: new Date('2026-01-01T00:00:00Z') },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const summary = await service.getSummary(context, 'exam-1');

      expect(summary.attemptDuration).toEqual({ avgMinutes: 50, minMinutes: 30, maxMinutes: 70 });
    });

    it('returns zero-valued stats and a null attemptDuration when no attempt has settled', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'in_progress', attemptId: 'a1' }),
        row({ status: 'invited' }),
      ]);

      const summary = await service.getSummary(context, 'exam-1');

      expect(summary.settledCount).toBe(0);
      expect(summary.passRate).toBe(0);
      expect(summary.averagePercentage).toBe(0);
      expect(summary.attemptDuration).toBeNull();
      expect(summary.scoreDistribution.every((bucket) => bucket.count === 0)).toBe(true);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });

  describe('getQuestionAccuracy', () => {
    it('scopes timesIncluded per question to only the attempts whose questionOrderJson contains it (pool-selection aware)', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1' }),
        row({ status: 'submitted', attemptId: 'a2' }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', questionOrderJson: JSON.stringify(['q1', 'q2']) },
            { id: 'a2', questionOrderJson: JSON.stringify(['q1']) },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Question 1' },
            { id: 'q2', text: 'Question 2' },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const accuracy = await service.getQuestionAccuracy(context, 'exam-1');

      const q1 = accuracy.find((r) => r.questionId === 'q1')!;
      const q2 = accuracy.find((r) => r.questionId === 'q2')!;
      expect(q1.timesIncluded).toBe(2);
      expect(q2.timesIncluded).toBe(1);
    });

    it('computes timesAttempted, timesSkipped, timesCorrect, and accuracyPercentage from answers', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1' }),
        row({ status: 'auto_submitted', attemptId: 'a2' }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', questionOrderJson: JSON.stringify(['q1']) },
            { id: 'a2', questionOrderJson: JSON.stringify(['q1']) },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true },
          ]),
        },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Question 1' }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const accuracy = await service.getQuestionAccuracy(context, 'exam-1');

      expect(accuracy).toEqual([
        { questionId: 'q1', questionText: 'Question 1', timesIncluded: 2, timesAttempted: 1, timesSkipped: 1, timesCorrect: 1, accuracyPercentage: 50 },
      ]);
    });

    it('returns an empty array when no attempt has settled', async () => {
      examsService.getResults.mockResolvedValue([row({ status: 'in_progress', attemptId: 'a1' })]);

      const accuracy = await service.getQuestionAccuracy(context, 'exam-1');

      expect(accuracy).toEqual([]);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });

  describe('getExportRows', () => {
    it('enriches each result row with durationMinutes computed from startedAt/submittedAt', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1', submittedAt: new Date('2026-01-01T00:20:00Z') }),
        row({ status: 'in_progress', attemptId: 'a2', submittedAt: null }),
        row({ status: 'invited', attemptId: null }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', startedAt: new Date('2026-01-01T00:00:00Z') },
            { id: 'a2', startedAt: new Date('2026-01-01T00:00:00Z') },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const exportRows = await service.getExportRows(context, 'exam-1');

      expect(exportRows[0].durationMinutes).toBe(20);
      expect(exportRows[1].durationMinutes).toBeNull();
      expect(exportRows[2].durationMinutes).toBeNull();
    });
  });

  describe('getCandidateDetail', () => {
    it("groups a candidate's questions by section, including a section aggregate score and full per-question detail", async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
          score: 5, maxScore: 14, percentage: 35.71, passFail: 'fail', submittedAt: new Date('2026-01-01T00:20:00Z'),
        }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([
              { sectionId: 'sec-1', title: 'Section One', questionIds: ['q1', 'q2'] },
              { sectionId: 'sec-2', title: 'Section Two', questionIds: ['q3'] },
            ]),
            answers: [
              { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 },
              { questionId: 'q3', selectedOptionIdsJson: JSON.stringify(['opt-c']), isCorrect: false, marksAwarded: 0 },
            ],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }, { id: 'opt-b', text: 'B', isCorrect: false }] },
            { id: 'q2', text: 'Q2 text', type: 'single_mcq', marks: 6, negativeMarks: 0, options: [{ id: 'opt-c2', text: 'C', isCorrect: true }] },
            { id: 'q3', text: 'Q3 text', type: 'single_mcq', marks: 3, negativeMarks: 0, options: [{ id: 'opt-c', text: 'C', isCorrect: false }, { id: 'opt-d', text: 'D', isCorrect: true }] },
          ]),
        },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.candidateId).toBe('cand-1');
      expect(detail.score).toBe(5);
      expect(detail.maxScore).toBe(14);
      expect(detail.sections).toHaveLength(2);
      expect(detail.sections[0]).toMatchObject({ sectionId: 'sec-1', title: 'Section One', score: 5, maxScore: 11 });
      expect(detail.sections[0].questions).toHaveLength(2);
      expect(detail.sections[0].questions[0]).toEqual({
        questionId: 'q1', questionText: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0,
        options: [{ id: 'opt-a', text: 'A' }, { id: 'opt-b', text: 'B' }],
        selectedOptionIds: ['opt-a'], correctOptionIds: ['opt-a'],
        isCorrect: true, marksAwarded: 5,
      });
      expect(detail.sections[0].questions[1]).toEqual({
        questionId: 'q2', questionText: 'Q2 text', type: 'single_mcq', marks: 6, negativeMarks: 0,
        options: [{ id: 'opt-c2', text: 'C' }],
        selectedOptionIds: [], correctOptionIds: ['opt-c2'],
        isCorrect: null, marksAwarded: null,
      });
      expect(detail.sections[1]).toMatchObject({ sectionId: 'sec-2', title: 'Section Two', score: 0, maxScore: 3 });
    });

    it('returns null score fields and an empty sections array for a candidate with no attempt yet, without querying attempt/question data', async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-2', candidateName: 'Bob', attemptId: null, status: 'invited' }),
      ]);

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-2');

      expect(detail).toEqual({
        candidateId: 'cand-2', candidateName: 'Bob', status: 'invited',
        score: null, maxScore: null, percentage: null, passFail: null, submittedAt: null,
        proctoringAnalysis: null, integrityAnalysis: null, sections: [], webcamTimeline: [],
      });
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('includes a parsed integrityAnalysis with its flags for a candidate with no attempt yet', async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-2', candidateName: 'Bob', attemptId: null, status: 'invited',
          integrityAnalysis: {
            status: 'flagged',
            level: 'high_risk',
            flagsJson: JSON.stringify([
              { type: 'tab_switch', severity: 'medium', detail: 'Left the exam tab 3 times' },
              { type: 'similarity', severity: 'high', detail: 'Matches another candidate', counterpartAttemptId: 'a9', similarity: 0.92 },
            ]),
            narrative: 'Two integrity flags raised.',
          },
        }),
      ]);

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-2');

      expect(detail.integrityAnalysis).toEqual({
        status: 'flagged',
        level: 'high_risk',
        narrative: 'Two integrity flags raised.',
        flags: [
          { type: 'tab_switch', severity: 'medium', detail: 'Left the exam tab 3 times' },
          { type: 'similarity', severity: 'high', detail: 'Matches another candidate', counterpartAttemptId: 'a9', similarity: 0.92 },
        ],
      });
      expect(detail.integrityAnalysis!.flags).toHaveLength(2);
    });

    it('degrades a malformed flagsJson to an empty flags array instead of throwing', async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-2', candidateName: 'Bob', attemptId: null, status: 'invited',
          integrityAnalysis: { status: 'flagged', level: 'medium_risk', flagsJson: 'not-valid-json{', narrative: null },
        }),
      ]);

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-2');

      expect(detail.integrityAnalysis).toEqual({ status: 'flagged', level: 'medium_risk', narrative: null, flags: [] });
    });

    it('throws NotFoundException when the candidate was never invited to this exam', async () => {
      examsService.getResults.mockResolvedValue([row({ candidateId: 'cand-1' })]);

      await expect(service.getCandidateDetail(context, 'exam-1', 'cand-999')).rejects.toThrow(NotFoundException);
    });

    it("floors a section's score at 0 when negative marking makes the raw sum negative", async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
          score: 0, maxScore: 10, percentage: 0, passFail: 'fail', submittedAt: new Date('2026-01-01T00:20:00Z'),
        }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([
              { sectionId: 'sec-1', title: 'Section One', questionIds: ['q1', 'q2'] },
            ]),
            answers: [
              { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-b']), isCorrect: false, marksAwarded: -2 },
              { questionId: 'q2', selectedOptionIdsJson: JSON.stringify(['opt-d']), isCorrect: false, marksAwarded: -1 },
            ],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 2, options: [{ id: 'opt-a', text: 'A', isCorrect: true }, { id: 'opt-b', text: 'B', isCorrect: false }] },
            { id: 'q2', text: 'Q2 text', type: 'single_mcq', marks: 5, negativeMarks: 1, options: [{ id: 'opt-c', text: 'C', isCorrect: true }, { id: 'opt-d', text: 'D', isCorrect: false }] },
          ]),
        },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.sections[0]).toMatchObject({ sectionId: 'sec-1', title: 'Section One', score: 0, maxScore: 10 });
    });

    it('builds a chronological webcamTimeline from webcam_ ProctoringEvents, mapping violation vs periodic snapshot entries', async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
          score: 5, maxScore: 5, percentage: 100, passFail: 'pass',
        }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1'] }]),
            answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 }],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }] },
          ]),
        },
        proctoringEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              eventType: 'webcam_multiple_faces',
              occurredAt: new Date('2026-01-01T00:05:00Z'),
              metadataJson: JSON.stringify({ snapshot: 'a', strike: 1 }),
            },
            {
              eventType: 'webcam_snapshot',
              occurredAt: new Date('2026-01-01T00:10:00Z'),
              metadataJson: JSON.stringify({ snapshot: 'b' }),
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(tx.proctoringEvent.findMany).toHaveBeenCalledWith({
        where: { attemptId: 'a1', eventType: { startsWith: 'webcam_' } },
        orderBy: { occurredAt: 'asc' },
      });
      expect(detail.webcamTimeline).toEqual([
        { occurredAt: '2026-01-01T00:05:00.000Z', kind: 'violation', reason: 'multiple_faces', strike: 1, snapshot: 'a' },
        { occurredAt: '2026-01-01T00:10:00.000Z', kind: 'periodic', snapshot: 'b' },
      ]);
    });

    it('signs a raw blob URL snapshot and leaves a data: URI snapshot identical', async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
          score: 5, maxScore: 5, percentage: 100, passFail: 'pass',
        }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1'] }]),
            answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 }],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }] },
          ]),
        },
        proctoringEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              eventType: 'webcam_snapshot',
              occurredAt: new Date('2026-01-01T00:10:00Z'),
              metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/b.jpg' }),
            },
            {
              eventType: 'webcam_snapshot',
              occurredAt: new Date('2026-01-01T00:15:00Z'),
              metadataJson: JSON.stringify({ snapshot: 'data:image/jpeg;base64,AAAA' }),
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.signIfOurs.mockImplementation(async (value: string) =>
        value.startsWith('https://') ? `${value}?sig=signed` : value,
      );

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.webcamTimeline).toEqual([
        { occurredAt: '2026-01-01T00:10:00.000Z', kind: 'periodic', snapshot: 'https://blob.test/container/webcam-snapshots/b.jpg?sig=signed' },
        { occurredAt: '2026-01-01T00:15:00.000Z', kind: 'periodic', snapshot: 'data:image/jpeg;base64,AAAA' },
      ]);
    });

    it('carries screenshot alongside snapshot only when metadataJson actually has that key -- both, snapshot-only, and screenshot-only', async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
          score: 5, maxScore: 5, percentage: 100, passFail: 'pass',
        }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1'] }]),
            answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 }],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }] },
          ]),
        },
        proctoringEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              eventType: 'webcam_multiple_faces',
              occurredAt: new Date('2026-01-01T00:05:00Z'),
              metadataJson: JSON.stringify({ snapshot: 'a', screenshot: 'sc-a', strike: 1 }),
            },
            {
              eventType: 'webcam_snapshot',
              occurredAt: new Date('2026-01-01T00:10:00Z'),
              metadataJson: JSON.stringify({ snapshot: 'b' }),
            },
            {
              eventType: 'webcam_head_turned',
              occurredAt: new Date('2026-01-01T00:15:00Z'),
              metadataJson: JSON.stringify({ screenshot: 'sc-c', strike: 2 }),
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.webcamTimeline).toEqual([
        { occurredAt: '2026-01-01T00:05:00.000Z', kind: 'violation', reason: 'multiple_faces', strike: 1, snapshot: 'a', screenshot: 'sc-a' },
        { occurredAt: '2026-01-01T00:10:00.000Z', kind: 'periodic', snapshot: 'b' },
        { occurredAt: '2026-01-01T00:15:00.000Z', kind: 'violation', reason: 'head_turned', strike: 2, snapshot: '', screenshot: 'sc-c' },
      ]);
    });

    it('does not throw and still returns the other events when one row has malformed metadataJson', async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
          score: 5, maxScore: 5, percentage: 100, passFail: 'pass',
        }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1'] }]),
            answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 }],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }] },
          ]),
        },
        proctoringEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              eventType: 'webcam_multiple_faces',
              occurredAt: new Date('2026-01-01T00:05:00Z'),
              metadataJson: '{not valid json',
            },
            {
              eventType: 'webcam_snapshot',
              occurredAt: new Date('2026-01-01T00:10:00Z'),
              metadataJson: JSON.stringify({ snapshot: 'b' }),
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.webcamTimeline).toEqual([
        { occurredAt: '2026-01-01T00:05:00.000Z', kind: 'violation', reason: 'multiple_faces', snapshot: '' },
        { occurredAt: '2026-01-01T00:10:00.000Z', kind: 'periodic', snapshot: 'b' },
      ]);
    });

    it('does not throw when metadataJson is the JSON literal "null" (valid JSON, but not an object)', async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
          score: 5, maxScore: 5, percentage: 100, passFail: 'pass',
        }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1'] }]),
            answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 }],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }] },
          ]),
        },
        proctoringEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              eventType: 'webcam_multiple_faces',
              occurredAt: new Date('2026-01-01T00:05:00Z'),
              metadataJson: 'null',
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.webcamTimeline).toEqual([
        { occurredAt: '2026-01-01T00:05:00.000Z', kind: 'violation', reason: 'multiple_faces', snapshot: '' },
      ]);
    });

    it('carries screenshotCapReached through to the entry when the screen-capture cap was hit', async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
          score: 5, maxScore: 5, percentage: 100, passFail: 'pass',
        }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1'] }]),
            answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 }],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }] },
          ]),
        },
        proctoringEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              eventType: 'webcam_multiple_faces',
              occurredAt: new Date('2026-01-01T00:05:00Z'),
              metadataJson: JSON.stringify({ snapshot: 'a', screenshotCapReached: true, strike: 1 }),
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.webcamTimeline).toEqual([
        { occurredAt: '2026-01-01T00:05:00.000Z', kind: 'violation', reason: 'multiple_faces', strike: 1, snapshot: 'a', screenshotCapReached: true },
      ]);
    });

    describe('with the real BlobStorageService (offline SAS signing, no network)', () => {
      const CONTAINER_URL = 'https://fakeaccount.blob.core.windows.net/container';
      let realService: ReportsService;

      beforeEach(() => {
        const credential = new StorageSharedKeyCredential('fakeaccount', Buffer.from('fake-key').toString('base64'));
        const realContainer = new ContainerClient(CONTAINER_URL, credential);
        (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue({
          getContainerClient: () => realContainer,
        });
        process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
        process.env.AZURE_STORAGE_CONTAINER = 'container';
        const realBlobStorage = new BlobStorageService();
        realService = new ReportsService(tenantPrisma as never, examsService as never, realBlobStorage);
      });

      afterEach(() => {
        delete process.env.AZURE_STORAGE_CONNECTION_STRING;
        delete process.env.AZURE_STORAGE_CONTAINER;
      });

      it('resolves a raw blob URL to a genuinely signed SAS URL', async () => {
        examsService.getResults.mockResolvedValue([
          row({
            candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
            score: 5, maxScore: 5, percentage: 100, passFail: 'pass',
          }),
        ]);
        const tx = {
          attempt: {
            findFirst: jest.fn().mockResolvedValue({
              sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1'] }]),
              answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 }],
            }),
          },
          question: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }] },
            ]),
          },
          proctoringEvent: {
            findMany: jest.fn().mockResolvedValue([
              {
                eventType: 'webcam_snapshot',
                occurredAt: new Date('2026-01-01T00:10:00Z'),
                metadataJson: JSON.stringify({ snapshot: `${CONTAINER_URL}/webcam-snapshots/b.jpg` }),
              },
            ]),
          },
        };
        tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

        const detail = await realService.getCandidateDetail(context, 'exam-1', 'cand-1');

        expect(detail.webcamTimeline[0].snapshot.startsWith(`${CONTAINER_URL}/webcam-snapshots/b.jpg?`)).toBe(true);
        expect(new URLSearchParams(detail.webcamTimeline[0].snapshot.split('?')[1]).get('sp')).toBe('r');
      });

      it('resolves both snapshot and screenshot to genuinely signed, read-only SAS URLs when an event carries both', async () => {
        examsService.getResults.mockResolvedValue([
          row({
            candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
            score: 5, maxScore: 5, percentage: 100, passFail: 'pass',
          }),
        ]);
        const tx = {
          attempt: {
            findFirst: jest.fn().mockResolvedValue({
              sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1'] }]),
              answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 }],
            }),
          },
          question: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }] },
            ]),
          },
          proctoringEvent: {
            findMany: jest.fn().mockResolvedValue([
              {
                eventType: 'webcam_multiple_faces',
                occurredAt: new Date('2026-01-01T00:10:00Z'),
                metadataJson: JSON.stringify({
                  snapshot: `${CONTAINER_URL}/webcam-snapshots/b.jpg`,
                  screenshot: `${CONTAINER_URL}/screen-captures/b.jpg`,
                  strike: 1,
                }),
              },
            ]),
          },
        };
        tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

        const detail = await realService.getCandidateDetail(context, 'exam-1', 'cand-1');
        const entry = detail.webcamTimeline[0];

        expect(entry.snapshot.startsWith(`${CONTAINER_URL}/webcam-snapshots/b.jpg?`)).toBe(true);
        expect(entry.screenshot?.startsWith(`${CONTAINER_URL}/screen-captures/b.jpg?`)).toBe(true);
        expect(new URLSearchParams(entry.snapshot.split('?')[1]).get('sp')).toBe('r');
        expect(new URLSearchParams(entry.screenshot!.split('?')[1]).get('sp')).toBe('r');
      });

      it('leaves a data: URI screenshot identical instead of mistaking it for an owned blob URL', async () => {
        examsService.getResults.mockResolvedValue([
          row({
            candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
            score: 5, maxScore: 5, percentage: 100, passFail: 'pass',
          }),
        ]);
        const tx = {
          attempt: {
            findFirst: jest.fn().mockResolvedValue({
              sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1'] }]),
              answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 }],
            }),
          },
          question: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }] },
            ]),
          },
          proctoringEvent: {
            findMany: jest.fn().mockResolvedValue([
              {
                eventType: 'webcam_multiple_faces',
                occurredAt: new Date('2026-01-01T00:10:00Z'),
                metadataJson: JSON.stringify({ snapshot: 'data:image/jpeg;base64,AAAA', screenshot: 'data:image/jpeg;base64,BBBB', strike: 1 }),
              },
            ]),
          },
        };
        tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

        const detail = await realService.getCandidateDetail(context, 'exam-1', 'cand-1');

        expect(detail.webcamTimeline[0].snapshot).toBe('data:image/jpeg;base64,AAAA');
        expect(detail.webcamTimeline[0].screenshot).toBe('data:image/jpeg;base64,BBBB');
      });
    });
  });

  describe('compareCandidates', () => {
    it('computes section-wise scores per candidate from their own attempt snapshot, aligning by sectionId even when pool sections drew different questions', async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted', score: 5, maxScore: 5, percentage: 100, passFail: 'pass' }),
        row({ candidateId: 'cand-2', candidateName: 'Bob', attemptId: 'a2', status: 'submitted', score: 0, maxScore: 5, percentage: 0, passFail: 'fail' }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Pool Section', questionIds: ['q1'] }]), answers: [{ questionId: 'q1', marksAwarded: 5 }] },
            { id: 'a2', sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Pool Section', questionIds: ['q2'] }]), answers: [{ questionId: 'q2', marksAwarded: 0 }] },
          ]),
        },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const comparison = await service.compareCandidates(context, 'exam-1', 'cand-1,cand-2');

      expect(comparison[0].sectionScores).toEqual([{ sectionId: 'sec-1', title: 'Pool Section', score: 5, maxScore: 5 }]);
      expect(comparison[1].sectionScores).toEqual([{ sectionId: 'sec-1', title: 'Pool Section', score: 0, maxScore: 5 }]);
    });

    it('throws BadRequestException when fewer than 2 candidateIds are provided, without calling getResults', async () => {
      await expect(service.compareCandidates(context, 'exam-1', 'cand-1')).rejects.toThrow(BadRequestException);
      expect(examsService.getResults).not.toHaveBeenCalled();
    });

    it('throws BadRequestException naming candidate(s) not invited to this exam', async () => {
      examsService.getResults.mockResolvedValue([row({ candidateId: 'cand-1', candidateName: 'Alice' })]);

      await expect(service.compareCandidates(context, 'exam-1', 'cand-1,cand-999')).rejects.toThrow(BadRequestException);
    });

    it('returns null score fields and empty sectionScores for a candidate with no attempt', async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-1', candidateName: 'Alice', attemptId: null, status: 'invited' }),
        row({ candidateId: 'cand-2', candidateName: 'Bob', attemptId: null, status: 'invited' }),
      ]);

      const comparison = await service.compareCandidates(context, 'exam-1', 'cand-1,cand-2');

      expect(comparison[0]).toEqual({
        candidateId: 'cand-1', candidateName: 'Alice', status: 'invited',
        score: null, maxScore: null, percentage: null, passFail: null,
        proctoringAnalysis: null, integrityAnalysis: null, sectionScores: [],
      });
    });

    it("floors a section's score at 0 when negative marking makes the raw sum negative", async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted', score: 0, maxScore: 10, percentage: 0, passFail: 'fail' }),
        row({ candidateId: 'cand-2', candidateName: 'Bob', attemptId: 'a2', status: 'submitted', score: 5, maxScore: 10, percentage: 50, passFail: 'fail' }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1', 'q2'] }]), answers: [{ questionId: 'q1', marksAwarded: -2 }, { questionId: 'q2', marksAwarded: -1 }] },
            { id: 'a2', sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Section One', questionIds: ['q1', 'q2'] }]), answers: [{ questionId: 'q1', marksAwarded: 5 }, { questionId: 'q2', marksAwarded: 0 }] },
          ]),
        },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const comparison = await service.compareCandidates(context, 'exam-1', 'cand-1,cand-2');

      expect(comparison[0].sectionScores).toEqual([{ sectionId: 'sec-1', title: 'Section One', score: 0, maxScore: 10 }]);
      expect(comparison[1].sectionScores).toEqual([{ sectionId: 'sec-1', title: 'Section One', score: 5, maxScore: 10 }]);
    });
  });
});
