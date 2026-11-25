import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useYxPermissions } from '../../lib/yx-org';
import { scoreReport } from '../../lib/yx-assessments';
import YxTestsPage from './(app)/hiring/assessments/tests/page';
import YxTestBuilderPage from './(app)/hiring/assessments/tests/[id]/page';
import YxScoreReportPage from './(app)/hiring/assessments/reports/[examId]/[candidateId]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/yx-org', () => ({ ...jest.requireActual('../../lib/yx-org'), useYxPermissions: jest.fn() }));

// Assessments AS-2 (answers 2007, 2008): the designed test builder and score report on the /asmt/tests and older routes.
const api = apiFetch as jest.Mock;
const calls: string[] = [];
const push = jest.fn();
const TEST = {
  id: 'e1',
  title: 'Java Backend Developer · L2',
  status: 'draft',
  durationMinutes: 60,
  passMark: 60,
  expectedCandidates: 800,
  proctoringMode: 'ai',
  sections: [{ id: 's1', title: 'Java', weightPercent: 100, mode: 'fixed', questions: 4, poolSize: null, poolDifficulty: null, poolTags: [], available: null, requiredCount: null, targetMinutes: null }],
  checks: [
    { id: 'sections', label: 'At least one section', ok: true, problem: null },
    { id: 'approval', label: 'Approved by a second person (for more than 500 candidates)', ok: false, problem: 'This test is for more than 500 candidates: another person must approve it before it is published' },
  ],
  editable: true,
  approval: { needed: true, threshold: 500, requestedBy: 'Meera Iyer', requestedAt: '2026-11-15T09:30:00.000Z', approvedBy: null, approvedAt: null, current: false, canApprove: true },
  createdAt: '2026-11-12T09:30:00.000Z',
};
const REPORT = { candidateName: 'Arjun Nair', status: 'submitted', score: 58, maxScore: 80, percentage: 72.5, passFail: 'pass', releaseOverride: null, released: true, submittedAt: '2026-11-14T06:22:00.000Z', integrityAnalysis: { status: 'completed', level: 'low' }, sections: [{ title: 'Java', score: 58, maxScore: 80 }] };

function route() {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    if (path === '/exams?pageSize=100') return { data: [{ id: 'e1', title: TEST.title, status: 'draft', createdAt: TEST.createdAt, invitationCount: 3 }], total: 1 };
    if (path === '/asmt/tests/defaults') return { proctorMode: 'record', highStakes: 500 };
    if (path === '/asmt/tests/e1') return TEST;
    if (path === '/exams' && init?.method === 'POST') return { id: 'e9' };
    if (path === '/exams/e1/duplicate') return { id: 'e8' };
    if (path === '/reports/e1/candidates/c1/report') return REPORT;
    if (path === '/exams/e1') return { title: TEST.title, passCriteriaPercent: 60 };
    if (path === '/asmt/tests/skills') return [{ id: 'k1', name: 'Java' }];
    if (path.startsWith('/asmt/tests/e1/sections/s1/question-choices')) return { chosen: [], choices: [{ id: 'q7', text: 'What is a stream?', type: 'single_mcq', difficulty: 'easy', marks: 2, skills: ['Java'] }] };
    return {};
  });
}
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );

/** The checklist and the approver are on the builder's review step (as drawn). */
const toReview = async () => {
  await screen.findByRole('button', { name: /^Continue/ });
  for (let i = 0; i < 8 && !screen.queryByRole('list', { name: 'Publish checks' }); i++) await userEvent.click(screen.getByRole('button', { name: /^(Continue|Review)/ }));
};

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: push });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
  (useParams as jest.Mock).mockReturnValue({ id: 'e1', examId: 'e1', candidateId: 'c1' });
  (useYxPermissions as jest.Mock).mockReturnValue(new Set(['exam:manage']));
  route();
});

it('Tests lists the company tests and names the company default mode; a new test is created and opened', async () => {
  wrap(<YxTestsPage />);
  expect(await screen.findByText('Java Backend Developer · L2')).toBeInTheDocument();
  expect(await screen.findByText(/proctored as Record & review \(the company default\)/)).toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: /New test/ }), 'Data Analyst');
  await userEvent.click(screen.getByRole('button', { name: 'Create test' }));
  expect(calls).toContain('POST /exams {"title":"Data Analyst"}');
  expect(push).toHaveBeenCalledWith('/yx/hiring/assessments/tests/e9');
});

it('Copy and edit duplicates a test and opens the copy', async () => {
  wrap(<YxTestsPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Copy and edit' }));
  expect(calls).toContain('POST /exams/e1/duplicate');
  expect(push).toHaveBeenCalledWith('/yx/hiring/assessments/tests/e8');
});

it('the builder shows the checklist and approves for the second person', async () => {
  wrap(<YxTestBuilderPage />);
  await toReview();
  const checks = screen.getByRole('list', { name: 'Publish checks' });
  expect(within(checks).getByText('This test is for more than 500 candidates: another person must approve it before it is published')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(calls).toContain('POST /asmt/tests/e1/approval/approve');
});

it('the Sections step picks bank questions and saves them on the section (answer 2284); no link to the older editor', async () => {
  wrap(<YxTestBuilderPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Questions' }));
  const d = await screen.findByRole('dialog', { name: 'Questions in Java' });
  await userEvent.click(await within(d).findByRole('button', { name: /^Add: What is a stream/ }));
  await userEvent.click(within(d).getByRole('button', { name: 'Save 1 question' }));
  expect(calls).toContain('GET /asmt/tests/e1/sections/s1/question-choices');
  expect(calls).toContain('PUT /exams/e1/sections/s1/questions {"questionIds":["q7"]}');
  expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/v2/exams'));
  // Answer 2285: the skills come from the tests key's route, not the bank's.
  expect(calls).toContain('GET /asmt/tests/skills');
  expect(calls).not.toContain('GET /tags');
});

it('an archived test is restored from the builder (answer 2287)', async () => {
  const base = api.getMockImplementation()!;
  api.mockImplementation(async (path: string, init?: RequestInit) => (path === '/asmt/tests/e1' && !init?.method ? { ...TEST, status: 'archived', editable: false } : base(path, init)));
  wrap(<YxTestBuilderPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
  await userEvent.click(within(screen.getByRole('dialog', { name: /Restore/ })).getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(calls).toContain('POST /asmt/tests/e1/restore'));
});

it('negative: a refused approval shows the reason and nothing else is sent', async () => {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (path === '/asmt/tests/e1/approval/approve') throw new Error('Another person approves this test: not the one who asked, and not its author.');
    if (path === '/asmt/tests/e1') return TEST;
    if (path === '/asmt/tests/skills') return [];
    return { data: [] };
  });
  wrap(<YxTestBuilderPage />);
  await toReview();
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(await screen.findByText('Another person approves this test: not the one who asked, and not its author.')).toBeInTheDocument();
  expect(calls.filter((c) => c.startsWith('POST'))).toEqual(['POST /asmt/tests/e1/approval/approve']);
});

it('the score report shows raw marks to a test writer and not to a recruiter', async () => {
  const { unmount } = wrap(<YxScoreReportPage />);
  expect(await screen.findByText('58 / 80')).toBeInTheDocument();
  expect(screen.getByText('Clear')).toBeInTheDocument();
  unmount();
  (useYxPermissions as jest.Mock).mockReturnValue(new Set(['results:view']));
  wrap(<YxScoreReportPage />);
  expect(await screen.findByText('Not shown to recruiters. Compare candidates on the score.')).toBeInTheDocument();
  expect(screen.queryByText('58 / 80')).toBeNull();
});

it('negative: an integrity check still running reads "Under review"; none reads "Not checked"', () => {
  expect(scoreReport({ ...REPORT, integrityAnalysis: { status: 'pending', level: null } }).integrity).toBe('Under review');
  expect(scoreReport({ ...REPORT, integrityAnalysis: null }).integrity).toBe('Not checked');
});

// Answer 2437: the Results tab of a published test and the readers' Test results page (the older /v2 results retire).
describe('test results', () => {
  const ROWS = [
    { invitationId: 'i1', candidateId: 'c1', attemptId: 'a1', candidateName: 'Arjun Nair', status: 'submitted', percentage: 72.5, passFail: 'pass', integrityLevel: 'clear', submittedAt: '2026-11-14T06:22:00.000Z' },
    { invitationId: 'i2', candidateId: 'c2', attemptId: 'a2', candidateName: 'Divya Menon', status: 'submitted', percentage: 41, passFail: 'fail', integrityLevel: 'review', submittedAt: '2026-11-14T07:00:00.000Z' },
  ];
  const published = () =>
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
      if (path === '/asmt/tests/e1') return { ...TEST, status: 'published', editable: false };
      if (path === '/exams/e1/results') return ROWS;
      if (path === '/exams/e1/results/summary') return { totalCandidates: 2, settledCount: 2, passRate: 50, averagePercentage: 56.8, resultsReleaseMode: 'manual' };
      if (path === '/exams/e1/results/release') return { released: 2 };
      if (path === '/asmt/tests/skills') return [];
      if (path === '/asmt/tests/defaults') return { proctorMode: 'ai', highStakes: 500 };
      if (path === '/exams?pageSize=100') return { data: [{ id: 'e1', title: TEST.title, status: 'published', createdAt: TEST.createdAt }, { id: 'e2', title: 'Draft test', status: 'draft', createdAt: TEST.createdAt }] };
      return {};
    });

  it('a test writer who reads results gets a Results tab: rows, a row opens the score report, release asks first', async () => {
    (useYxPermissions as jest.Mock).mockReturnValue(new Set(['exam:manage', 'results:view']));
    published();
    wrap(<YxTestBuilderPage />);
    await userEvent.click(await screen.findByRole('tab', { name: /Results/ }));
    await userEvent.click(await screen.findByText('Divya Menon'));
    expect(push).toHaveBeenCalledWith('/yx/hiring/assessments/reports/e1/c2');
    await userEvent.click(screen.getByRole('button', { name: 'Release results' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Release' }));
    await waitFor(() => expect(calls).toContain('POST /exams/e1/results/release {"notify":false}'));
  });

  it('negative: without a results key the test page has no Results tab and never asks for results', async () => {
    published();
    wrap(<YxTestBuilderPage />);
    expect(await screen.findByRole('heading', { name: TEST.title, level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Results/ })).toBeNull();
    expect(calls.some((c) => c.includes('/results'))).toBe(false);
  });

  it("a reader's Test results lists published tests only; the chosen test's rows show, with no Release", async () => {
    const YxTestResultsPage = (await import('./(app)/hiring/assessments/results/page')).default;
    const { useSearchParams } = jest.requireMock('next/navigation') as { useSearchParams: jest.Mock };
    useSearchParams.mockReturnValue(new URLSearchParams('test=e1'));
    (useYxPermissions as jest.Mock).mockReturnValue(new Set(['results:view']));
    published();
    wrap(<YxTestResultsPage />);
    expect(await screen.findByText('Arjun Nair')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release results' })).toBeNull();
    useSearchParams.mockReturnValue(undefined);
  });

  it('negative: someone without a results key is told who gives access, and nothing is fetched', async () => {
    const YxTestResultsPage = (await import('./(app)/hiring/assessments/results/page')).default;
    (useYxPermissions as jest.Mock).mockReturnValue(Object.assign(new Set<string>(), { isSuccess: true }));
    published();
    wrap(<YxTestResultsPage />);
    expect(await screen.findByText(/HR/)).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});
