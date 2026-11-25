import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxMarkingPage from './(app)/hiring/assessments/marking/page';
import YxFairnessPage from './(app)/hiring/assessments/fairness/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Assessments AS-6: marking (PRC-19) and fairness (answers 2019, 2165) on the real pages, the API mocked.
const api = apiFetch as jest.Mock;
const calls: string[] = [];
let keys: string[] = [];
const ITEM = {
  attemptId: 'a1',
  questionId: 'q1',
  test: 'Quality supervisor',
  candidate: 'Candidate A1B2',
  blind: true,
  question: { text: 'How would you cut deviations?', type: 'essay', marks: 10 },
  answer: { text: 'Group them by station.', language: null, files: [] },
  state: 'needs_first',
  mine: null,
  toModerate: null,
  minor: false,
  suggestion: null,
  attemptReady: false,
};
const FAIR = {
  exam: { id: 'e1', title: 'Campus aptitude' },
  minGroup: 30,
  described: 80,
  rows: [
    { group: 'Men', attempts: 40, rate: 0.6, ratio: 1, status: 'ok' },
    { group: 'Women', attempts: 40, rate: 0.3, ratio: 0.5, status: 'flagged' },
    { group: 'Another way', attempts: null, rate: null, ratio: null, status: 'hidden' },
  ],
  finding: { group: 'Women', ratio: 0.5 },
  review: null,
  survey: null,
};

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  keys = ['asmt.test.manage'];
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    if (path.startsWith('/rbac/me/permissions')) return keys;
    if (path === '/asmt/marking') return [{ attemptId: 'a1', questionId: 'q1' }];
    if (path === '/asmt/marking/a1/q1') return ITEM;
    if (path.startsWith('/exams?')) return { data: [{ id: 'e1', title: 'Campus aptitude' }], total: 1 };
    if (path === '/asmt/fairness/e1') return FAIR;
    return {};
  });
});

it('marking: the first answer in my queue opens blind and my mark is sent', async () => {
  wrap(<YxMarkingPage />);
  expect(await screen.findByText(/Candidate hidden \(blind marking\)/)).toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: /Your marks/ }), '6');
  await userEvent.type(screen.getByRole('textbox', { name: /Feedback/ }), 'Clear method');
  await userEvent.click(screen.getByRole('button', { name: 'Save mark' }));
  expect(calls).toContain('POST /asmt/marking/a1/q1/mark {"marks":6,"feedback":"Clear method"}');
});

it('negative: marking with no marks, or an empty queue, sends nothing', async () => {
  const { unmount } = wrap(<YxMarkingPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Save mark' }));
  expect(calls.filter((c) => c.startsWith('POST'))).toEqual([]);
  unmount();
  api.mockImplementation(async (path: string) => (path === '/asmt/marking' ? [] : {}));
  wrap(<YxMarkingPage />);
  expect(await screen.findByText('Nothing to mark.')).toBeInTheDocument();
});

it('fairness: a test writer opens a review on a finding', async () => {
  wrap(<YxFairnessPage />);
  expect(await screen.findByText('0.50')).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: 'Open review task' }));
  expect(calls).toContain('POST /asmt/fairness/e1/review');
});

it('negative: a results reader sees the numbers but cannot open a review', async () => {
  keys = ['asmt.results.view'];
  wrap(<YxFairnessPage />);
  expect(await screen.findByText('0.50')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open review task' })).not.toBeInTheDocument();
});
