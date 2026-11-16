import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxIntegrityQueuePage from './(app)/hiring/assessments/integrity/page';
import YxIncidentPage from './(app)/hiring/assessments/integrity/[id]/page';
import YxAppealsPage from './(app)/hiring/assessments/appeals/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

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
