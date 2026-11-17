import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, apiFetchBlob } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxIntegrityQueuePage from './(app)/hiring/assessments/integrity/page';
import YxIncidentPage from './(app)/hiring/assessments/integrity/[id]/page';
import YxAppealsPage from './(app)/hiring/assessments/appeals/page';
import YxLiveConsolePage from './(app)/hiring/assessments/tests/[id]/live/page';
import YxIntegrityReportsPage from './(app)/hiring/assessments/integrity-reports/page';
import { useExamMonitoring } from '../../lib/hooks/useExamMonitoring';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useExamMonitoring', () => ({ useExamMonitoring: jest.fn() }));

// Assessments AS-5 part 1 (answers 2006, 2012): the integrity queue (PRC-16), one incident (PRC-17) and appeals (PRC-18).
const api = apiFetch as jest.Mock;
const calls: string[] = [];
const push = jest.fn();
// A token whose subject is the signed-in reviewer (u-me).
const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: 'u-me' })).toString('base64url')}.y`;
const ROW = { id: 'i1', candidate: 'Sneha Iyer', test: 'Java L2', level: 'high_concern', flags: ['similarity_match'], status: 'open', reviewer: null, verdict: null, appeal: null, openedAt: '2026-11-15T09:30:00.000Z' };
const INC = { ...ROW, candidate: { name: 'Sneha Iyer', email: 's@x.in' }, test: { title: 'Java L2' }, submittedAt: '2026-11-15T09:02:00.000Z', sections: ['Java'], analysis: { flags: [{ type: 'similarity_match', severity: 'high', detail: '91 % similar' }], narrative: null }, events: [], reviewer: null, sectionTitle: null, reason: null, decidedBy: null, decidedAt: null, secondReviewer: null, confirmedBy: null, confirmedAt: null, appealClosesAt: null, appeal: null };
const APPEAL = { id: 'a1', candidate: 'Manoj Kumar', test: 'Java L2', verdict: 'warning', sectionTitle: null, verdictReason: 'A second voice was heard twice.', verdictBy: ['Gopal Menon'], excluded: ['u-gopal'], text: 'It was the TV in the next room.', status: 'open', reason: null, decidedBy: null, decidedAt: null, createdAt: '2026-11-15T10:00:00.000Z' };

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push });
  (useParams as jest.Mock).mockReturnValue({ id: 'i1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: TOKEN });
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    if (path === '/asmt/integrity') return [ROW];
    if (path === '/asmt/integrity/i1') return INC;
    if (path === '/asmt/integrity/reviewers') return [{ id: 'u-gopal', name: 'Gopal Menon' }];
    if (path === '/asmt/appeals') return [APPEAL];
    if (path === '/exams?pageSize=100') return { data: [{ id: 'exam-1', title: 'Campus aptitude 2026' }], total: 1 };
    if (path === '/asmt/integrity-reports/exam-1')
      return { test: { id: 'exam-1', title: 'Campus aptitude 2026' }, attempts: 3, minSame: 5, clusters: [{ id: 'CL-01', who: ['Rahul Deshpande', 'Harish Gowda'], same: 5, timing: 'Started within 4 min', incident: 'Not raised' }], sizes: [], pairs: [], agreement: { weeks: [], target: 0.7, markers: [], doubleMarked: 0 } };
    if (path === '/asmt/live/exam-1/frames') return [{ attemptId: 'att-1', url: 'https://blob.test/att-1.jpg', at: '2026-11-17T08:20:00.000Z' }];
    if (path === '/attempts/att-1/messages') return [{ id: 'm1', fromCandidate: true, body: 'Sorry, fixed now.', sentAt: '2026-11-17T08:24:00.000Z', readAt: null }];
    return {};
  });
});

it('the queue lists incidents and opens one', async () => {
  wrap(<YxIntegrityQueuePage />);
  await userEvent.click(await screen.findByText('Sneha Iyer'));
  expect(push).toHaveBeenCalledWith('/yx/hiring/assessments/integrity/i1');
});

it('an incident is taken, and invalidating it names the second reviewer', async () => {
  wrap(<YxIncidentPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Take this review' }));
  expect(calls).toContain('POST /asmt/integrity/i1/take');
  await userEvent.click(screen.getByLabelText(/Attempt invalidated/));
  await userEvent.click(screen.getByRole('combobox', { name: /^Second reviewer/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Gopal Menon' }));
  await userEvent.type(screen.getByLabelText(/Reason and evidence/), 'Code 91 % similar to another candidate.');
  await userEvent.click(screen.getByRole('button', { name: 'Send for second review' }));
  expect(calls).toContain('POST /asmt/integrity/i1/invalidate {"reason":"Code 91 % similar to another candidate.","secondReviewerId":"u-gopal"}');
});

it('negative: a verdict without a reason of 10 characters sends nothing', async () => {
  wrap(<YxIncidentPage />);
  await userEvent.click(await screen.findByLabelText(/Cleared/));
  await userEvent.type(screen.getByLabelText(/Reason and evidence/), 'ok');
  await userEvent.click(screen.getByRole('button', { name: 'Save verdict' }));
  expect(calls.filter((c) => c.startsWith('POST'))).toEqual([]);
});

it('an appeal is upheld with a reason by someone who did not give the verdict', async () => {
  wrap(<YxAppealsPage />);
  await userEvent.click(await screen.findByLabelText(/Uphold the original decision/));
  await userEvent.type(screen.getByLabelText(/Reason sent to the candidate/), 'The voice is clear on the recording at 20:40.');
  await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
  expect(calls).toContain('POST /asmt/appeals/a1/uphold {"reason":"The voice is clear on the recording at 20:40."}');
});

it('negative: the reviewer who gave the verdict sees that someone else decides', async () => {
  (useAuth as jest.Mock).mockReturnValue({ accessToken: `x.${Buffer.from(JSON.stringify({ sub: 'u-gopal' })).toString('base64url')}.y` });
  wrap(<YxAppealsPage />);
  expect(await screen.findByText('You gave this verdict, so someone else decides the appeal.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save decision' })).not.toBeInTheDocument();
});

// AS-5 part 2 (PRC-13): the live console from the monitoring socket; actions go to the attempt routes with a reason.
describe('live console page', () => {
  const refresh = jest.fn();
  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ id: 'exam-1' });
    (useExamMonitoring as jest.Mock).mockReturnValue({
      roster: [
        { candidateId: 'c1', candidateName: 'Sneha Iyer', invitationId: 'i1', attemptId: 'att-1', status: 'in_progress', online: true, remainingSeconds: 1800, answeredCount: 5, totalQuestions: 20, proctoringBypassed: false },
        { candidateId: 'c2', candidateName: 'Not Started', invitationId: 'i2', attemptId: null, status: 'invited', online: false, remainingSeconds: null, answeredCount: null, totalQuestions: null, proctoringBypassed: false },
      ],
      rosterUpdatedAt: 1,
      alerts: [{ attemptId: 'att-1', candidateId: 'c1', eventType: 'webcam_multiple_faces', severity: 'high', occurredAt: '2026-11-17T08:23:15.000Z' }],
      leaderboard: [],
      connectionStatus: 'connected',
      joinError: null,
      refresh,
    });
  });

  it('shows started attempts by concern and pauses one with a reason', async () => {
    wrap(<YxLiveConsolePage />);
    // Answer 2268: the latest camera frame and the score from the flags so far (one high flag: 49, high concern).
    expect(await screen.findByRole('img', { name: 'Sneha Iyer: latest camera frame' })).toHaveAttribute('src', 'https://blob.test/att-1.jpg');
    expect(screen.getByText('49 · High concern')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /^Sneha Iyer,/ }));
    expect(screen.queryByText('Not Started')).not.toBeInTheDocument();
    expect(screen.getByText(/webcam multiple faces \(high\)/)).toBeInTheDocument();
    // Answer 2269: the thread both ways.
    expect(await screen.findByText('Sorry, fixed now.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await userEvent.type(screen.getByLabelText(/^Reason/), 'A second person came into the room.');
    await userEvent.click(screen.getByRole('button', { name: 'Pause test' }));
    expect(calls).toContain('POST /attempts/att-1/pause {"reason":"A second person came into the room."}');
    expect(refresh).toHaveBeenCalled();
  });

  it('negative: a join error shows it, with a retry', async () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], rosterUpdatedAt: null, alerts: [], leaderboard: [], connectionStatus: 'disconnected', joinError: 'You need the proctor key and your second factor.', refresh });
    wrap(<YxLiveConsolePage />);
    expect(await screen.findByText('You need the proctor key and your second factor.')).toBeInTheDocument();
  });
});

// AS-5 part 3 (PRC-20): the first test's reports; the export downloads the workbook.
it('integrity reports: the first test\'s clusters; Export downloads the workbook', async () => {
  (apiFetchBlob as jest.Mock).mockResolvedValue({ blob: new Blob(['PK']), filename: 'integrity-reports-exam-1.xlsx' });
  const createObjectURL = jest.fn(() => 'blob:x');
  Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
  wrap(<YxIntegrityReportsPage />);
  expect(await screen.findByText('Rahul Deshpande, Harish Gowda')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Export XLSX' }));
  expect(apiFetchBlob).toHaveBeenCalledWith('/asmt/integrity-reports/exam-1/export', {}, expect.anything());
  expect(createObjectURL).toHaveBeenCalled();
});
