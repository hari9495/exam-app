// Sample `live` data for the PRC-04 and PRC-06 stories of the states the real tests have (AS-2), and for the tests.
// Not used by the app.
import type { BuilderTestView, LiveScoreReport, LiveTestBuilder, TestListRow } from './tests-live';

const ok = () => Promise.resolve();

export const TEST_ROWS: TestListRow[] = [
  { id: 't1', title: 'Java Backend Developer · L2', status: 'draft', invited: 0, createdAt: '2026-11-12T09:30:00.000Z' },
  { id: 't2', title: 'Campus aptitude 2026', status: 'published', invited: 412, createdAt: '2026-10-02T09:30:00.000Z' },
];

export const BUILDER_TEST: BuilderTestView = {
  id: 't1',
  title: 'Java Backend Developer · L2',
  status: 'draft',
  durationMinutes: 60,
  passMark: 60,
  expectedCandidates: 800,
  proctoringMode: 'ai',
  sections: [
    { id: 's1', title: 'Aptitude', weightPercent: 30, mode: 'fixed', questions: 12, poolSize: null, poolDifficulty: null, poolTags: [], available: null, requiredCount: null, targetMinutes: 20 },
    { id: 's2', title: 'Java', weightPercent: 50, mode: 'pool', questions: 0, poolSize: 10, poolDifficulty: 'medium', poolTags: ['Java', 'Streams API'], available: 34, requiredCount: null, targetMinutes: null },
    { id: 's3', title: 'SQL', weightPercent: 20, mode: 'pool', questions: 0, poolSize: 8, poolDifficulty: 'hard', poolTags: ['SQL joins'], available: 5, requiredCount: null, targetMinutes: null },
  ],
  checks: [
    { id: 'sections', label: 'At least one section', ok: true, problem: null },
    { id: 'weights', label: 'Section weights add up to 100 %', ok: true, problem: null },
    { id: 'questions:s1', label: 'Aptitude: questions attached', ok: true, problem: null },
    { id: 'pool:s2', label: 'Java: enough approved questions in the pool', ok: true, problem: null },
    { id: 'pool:s3', label: 'SQL: enough approved questions in the pool', ok: false, problem: 'Section "SQL" pool requires 8 matching questions, only 5 available' },
    { id: 'approval', label: 'Approved by a second person (for more than 500 candidates)', ok: false, problem: 'This test is for more than 500 candidates: another person must approve it before it is published' },
  ],
  editable: true,
  approval: { needed: true, threshold: 500, requestedBy: null, requestedAt: null, approvedBy: null, approvedAt: null, current: false, canApprove: false },
  createdAt: '2026-11-12T09:30:00.000Z',
};

/** Every check passes, approval asked for by Meera and waiting for the viewer. */
export const BUILDER_WAITING: BuilderTestView = {
  ...BUILDER_TEST,
  sections: BUILDER_TEST.sections.map((s) => (s.id === 's3' ? { ...s, available: 26 } : s)),
  checks: BUILDER_TEST.checks.map((c) => (c.id === 'approval' ? { ...c, ok: false } : { ...c, ok: true, problem: null })),
  approval: { ...BUILDER_TEST.approval, requestedBy: 'Meera Iyer', requestedAt: '2026-11-15T09:30:00.000Z', canApprove: true },
};

export function liveBuilder(over: Partial<LiveTestBuilder> = {}): LiveTestBuilder {
  return {
    state: 'ready',
    onRetry: () => {},
    test: BUILDER_TEST,
    tests: TEST_ROWS,
    defaultMode: 'ai',
    onNew: ok,
    onCopy: ok,
    onOpen: () => {},
    onSaveDetails: ok,
    onSetMode: ok,
    onEditSections: () => {},
    onRequestApproval: ok,
    onApprove: ok,
    onPublish: ok,
    ...over,
  };
}

export function liveReport(over: Partial<LiveScoreReport> = {}): LiveScoreReport {
  return {
    state: 'ready',
    onRetry: () => {},
    viewer: 'owner',
    testTitle: 'Java Backend Developer · L2',
    passMark: 60,
    report: {
      candidateName: 'Arjun Nair',
      status: 'submitted',
      score: 58,
      maxScore: 80,
      percentage: 72.5,
      passFail: 'pass',
      releaseOverride: null,
      released: true,
      submittedAt: '2026-11-14T06:22:00.000Z',
      integrity: 'Clear',
      sections: [
        { title: 'Aptitude', percentage: 45 },
        { title: 'Java', percentage: 81 },
        { title: 'SQL', percentage: 74 },
      ],
    },
    ...over,
  };
}
