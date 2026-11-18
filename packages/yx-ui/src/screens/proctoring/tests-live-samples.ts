// Sample `live` data for the PRC-04 and PRC-06 stories of the states the real tests have (AS-2), and for the tests.
// Not used by the app.
import type { BuilderTestView, LiveScoreReport, LiveTestBuilder, QuestionChoice, TestListRow } from './tests-live';

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
    { id: 's2', title: 'Java', weightPercent: 50, mode: 'pool', questions: 0, poolSize: 10, poolDifficulty: 'medium', poolTags: ['Java', 'Streams API'], poolTagIds: ['k1'], available: 34, requiredCount: null, targetMinutes: null },
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

/** Answer 2151: what the AI found in a job description, one skill not in the library yet. */
export const JD_PLAN = { level: 'hard' as const, skills: [{ name: 'Java streams', tagId: 'k1', percent: 50 }, { name: 'SQL joins', tagId: 'k2', percent: 30 }, { name: 'Spring', tagId: null, percent: 20 }] };
export const COMPANY_SKILLS = [{ id: 'k1', name: 'Java streams' }, { id: 'k2', name: 'SQL joins' }, { id: 'k3', name: 'Spring Boot' }];

/** Answer 2284: bank questions the Sections step's picker shows. */
export const CHOSEN: QuestionChoice[] = [{ id: 'q1', text: 'A train 120 m long passes a pole in 6 seconds. What is its speed?', type: 'single_mcq', difficulty: 'easy', marks: 2, skills: ['Aptitude'] }];
export const CHOICES: QuestionChoice[] = [
  { id: 'q2', text: 'What does Collectors.groupingBy return for an empty stream?', type: 'single_mcq', difficulty: 'medium', marks: 4, skills: ['Java streams'] },
  { id: 'q3', text: 'Write a query that lists customers with no orders.', type: 'code', difficulty: 'hard', marks: 10, skills: ['SQL joins'] },
];

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
    onRequestApproval: ok,
    onApprove: ok,
    onPublish: ok,
    onAddSection: ok,
    onSaveSection: ok,
    onDeleteSection: ok,
    onLoadChoices: () => Promise.resolve({ chosen: CHOSEN, choices: CHOICES }),
    onSetQuestions: ok,
    onSetPool: ok,
    skills: COMPANY_SKILLS,
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

// Answer 2437: the Results tab of a published test.
export const RESULT_ROWS: import('./tests-results').TestResultRow[] = [
  { invitationId: 'inv-1', candidateId: 'c-1', attemptId: 'a-1', candidateName: 'Ananya Iyer', status: 'submitted', percentage: 82.5, passFail: 'pass', integrityLevel: 'clear', submittedAt: '2026-11-14T11:20:00+05:30' },
  { invitationId: 'inv-2', candidateId: 'c-2', attemptId: 'a-2', candidateName: 'Rahul Menon', status: 'submitted', percentage: 54, passFail: 'fail', integrityLevel: 'review', submittedAt: '2026-11-14T12:05:00+05:30' },
  { invitationId: 'inv-3', candidateId: 'c-3', attemptId: 'a-3', candidateName: 'Fatima Sheikh', status: 'pending_manual_grade', percentage: null, passFail: null, integrityLevel: 'high_concern', submittedAt: '2026-11-15T09:40:00+05:30' },
  { invitationId: 'inv-4', candidateId: 'c-4', attemptId: null, candidateName: 'Vikram Rao', status: 'invited', percentage: null, passFail: null, integrityLevel: null, submittedAt: null },
];
export const liveResults = (over: Partial<import('./tests-results').LiveTestResults> = {}): import('./tests-results').LiveTestResults => ({
  state: 'ready',
  onRetry: () => undefined,
  summary: { totalCandidates: 4, settledCount: 2, passRate: 50, averagePercentage: 68.3, resultsReleaseMode: 'manual' },
  rows: RESULT_ROWS,
  onOpen: () => undefined,
  onExport: () => Promise.resolve(),
  onRelease: () => Promise.resolve({ released: 2 }),
  onCompare: (ids) =>
    Promise.resolve(
      RESULT_ROWS.filter((r) => ids.includes(r.invitationId)).map((r) => ({ invitationId: r.invitationId, candidateName: r.candidateName, percentage: r.percentage, passFail: r.passFail, integrityLevel: r.integrityLevel, sections: [{ title: 'Aptitude', percentage: r.percentage }, { title: 'Java', percentage: r.percentage == null ? null : r.percentage - 5 }] })),
    ),
  ...over,
});
