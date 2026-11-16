import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { candidateApiFetch } from '../../lib/candidate-api-client';
import { useCandidateAuth } from '../../lib/candidate-auth-context';
import YxInvitationsPage from './(app)/hiring/assessments/invitations/page';
import MyTestsPage from '../(candidate)/my-tests/page';
import ResultReusePage from '../(candidate)/reuse/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/candidate-api-client', () => ({ candidateApiFetch: jest.fn(), setCandidateUnauthorizedHandler: jest.fn() }));
jest.mock('../../lib/candidate-auth-context', () => ({ useCandidateAuth: jest.fn() }));

// Assessments AS-3 (answers 2001, 2013, 2159): invitations and drives (PRC-07), the candidate's tests (PRC-21) and using an
// earlier result (PRC-32), on the /asmt and /attempt routes.
const api = apiFetch as jest.Mock;
const capi = candidateApiFetch as jest.Mock;
const calls: string[] = [];
const push = jest.fn();
const switchTo = jest.fn();
const ROW = { candidateId: 'c1', examId: 'e1', test: 'Java L2', jobs: ['Senior Backend Developer'], drive: null, invitedAt: '2026-11-02T04:30:00.000Z', expiresAt: '2026-11-08T18:29:00.000Z', resendCount: 0, reinvitedAt: null, reinviteReason: null, extraTimePercent: 0, reusedAt: null };
const INVITATIONS = [
  { ...ROW, id: 'i1', name: 'Arjun Nair', email: 'arjun@example.in', status: 'Invited', expiresAt: '2026-12-08T18:29:00.000Z' },
  { ...ROW, id: 'i2', name: 'Mohammed Faiz', email: 'faiz@example.in', status: 'Missed' },
];
const OFFER = { attemptId: 'a1', testTitle: 'Java L2', takenAt: '2026-06-12T09:00:00.000Z', passed: true, validUntil: '2026-12-12T09:00:00.000Z', months: 6 };
const CURRENT = { candidateName: 'Arjun Nair', organizationName: 'Acme Labs', organizationLogoUrl: null, exam: { title: 'Java L2' }, sections: [] };
const log = (path: string, init?: RequestInit) => calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.mockReset();
  capi.mockReset();
  calls.length = 0;
  push.mockReset();
  switchTo.mockReset().mockResolvedValue(undefined);
  (useRouter as jest.Mock).mockReturnValue({ push, replace: push });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
  (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'ctok', isLoading: false, switchTo });
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    log(path, init);
    if (path === '/asmt/invitations') return INVITATIONS;
    if (path === '/asmt/drives') return [{ id: 'd1', name: 'Campus TN', tests: ['Java L2'], job: null, from: null, to: null, sessions: 0, invited: 0, attempted: 0, status: 'Planning' }];
    if (path.startsWith('/exams?status=published')) return { data: [{ id: 'e1', title: 'Java L2', status: 'published', createdAt: '2026-11-01T00:00:00.000Z' }, { id: 'e2', title: 'Old draft', status: 'draft', createdAt: '2026-11-01T00:00:00.000Z' }] };
    if (path.startsWith('/candidates?')) return { data: [{ id: 'c9', name: 'Anita Das', email: 'anita@example.in', erasedAt: null }] };
    if (path === '/exams/e1/invitations') return { created: [{ id: 'n1' }], skipped: [] };
    if (path === '/asmt/invitations/i2/reinvite') throw new Error('This candidate was already re-invited once.');
    return {};
  });
});

describe('Hire › Assessments › Invitations & drives (PRC-07)', () => {
  it('lists the invitations from /asmt/invitations and invites a picked candidate to a published test', async () => {
    wrap(<YxInvitationsPage />);
    expect(await screen.findByText('Mohammed Faiz')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Invite candidates' })[0]!);
    await userEvent.click(screen.getByRole('combobox', { name: 'Test' }));
    expect(screen.queryByRole('option', { name: 'Old draft' })).toBeNull();
    await userEvent.click(screen.getByRole('option', { name: 'Java L2' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Candidates' }));
    await userEvent.click(await screen.findByRole('option', { name: /Anita Das/ }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Send 1 invitation' }));
    expect(calls).toContain('POST /exams/e1/invitations {"candidateIds":["c9"]}');
  });

  it('re-invites a missed candidate with the reason; negative: the server refusal is shown', async () => {
    wrap(<YxInvitationsPage />);
    await userEvent.click(await screen.findByText('Mohammed Faiz'));
    await userEvent.click(screen.getByRole('button', { name: 'Re-invite once, with reason' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Why re-invite/ }), 'Power cut at the college');
    await userEvent.click(screen.getByRole('button', { name: 'Re-invite' }));
    expect(calls).toContain('POST /asmt/invitations/i2/reinvite {"reason":"Power cut at the college"}');
    expect(await screen.findByText('This candidate was already re-invited once.')).toBeInTheDocument();
  });

  it('negative: a load failure shows retry', async () => {
    api.mockImplementation(async () => {
      throw new Error('Forbidden');
    });
    wrap(<YxInvitationsPage />);
    expect(await screen.findByText("We couldn't load invitations.")).toBeInTheDocument();
  });
});

describe('Candidate: my tests and using an earlier result (PRC-21, PRC-32)', () => {
  const candidateRoutes = (reuse: unknown) =>
    capi.mockImplementation(async (path: string, init?: RequestInit) => {
      log(path, init);
      if (path === '/attempt/current') return CURRENT;
      if (path === '/attempt/my-tests')
        return [
          { invitationId: 'i1', testTitle: 'Java L2', status: 'invited', expiresAt: '2026-12-08T18:29:00.000Z', durationMinutes: 60, extraTimePercent: 0, current: true },
          { invitationId: 'i3', testTitle: 'SQL basics', status: 'invited', expiresAt: '2026-12-08T18:29:00.000Z', durationMinutes: 30, extraTimePercent: 0, current: false },
        ];
      if (path === '/attempt/reuse' && !init?.method) return reuse;
      return {};
    });

  it('names the real company and candidate, offers the earlier result and opens another test', async () => {
    candidateRoutes({ offer: OFFER, reused: null });
    wrap(<MyTestsPage />);
    expect(await screen.findByText('SQL basics')).toBeInTheDocument();
    expect(await screen.findByText('Acme Labs')).toBeInTheDocument();
    expect(screen.queryByText('Kaveri Foods')).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Use my earlier result' }));
    expect(push).toHaveBeenCalledWith('/reuse');
    await userEvent.click(screen.getByRole('button', { name: 'Open this test' }));
    expect(switchTo).toHaveBeenCalledWith('i3');
    expect(push).toHaveBeenCalledWith('/welcome');
  });

  it('uses the earlier result after agreeing (POST /attempt/reuse with agree)', async () => {
    candidateRoutes({ offer: OFFER, reused: null });
    wrap(<ResultReusePage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /I agree that Acme Labs may use/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Use my result' }));
    expect(calls).toContain('POST /attempt/reuse {"attemptId":"a1","agree":true}');
  });

  it('negative: nothing to reuse sends the candidate to the test with retake, so the welcome page does not loop back', async () => {
    candidateRoutes({ offer: null, reused: null });
    wrap(<ResultReusePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Go to the test' }));
    expect(push).toHaveBeenCalledWith('/welcome?retake=1');
    expect(within(document.body).queryByRole('checkbox')).toBeNull();
  });
});
