import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxInterviewPage from './(app)/hiring/interviews/[id]/page';
import YxDraftScorecardPage from './(app)/hiring/interviews/[id]/draft/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// HIR-25 interview notetaker (founder decision 2) on the API: the card on the interview page, the draft review page.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const router = { push: jest.fn(), replace: jest.fn() };
const VIEW = {
  interview: { id: 'iv1', status: 'confirmed', location: 'Room 4', timeZone: 'Asia/Kolkata', meetingUrl: null, slots: [], jobId: 'j1', jobTitle: 'Plant Engineer', candidateId: 'c1', candidateName: 'Priya Raman' },
  panel: [{ userId: 'u2', name: 'Kavya', submitted: false }], resume: null,
  template: { id: 'tp1', name: 'Round 1', scaleMax: 4, passBar: 2.5, items: [{ id: 'a', label: 'Safety', guidance: null, weight: 1 }] },
  viewer: { isPanelist: true, isOverseer: false }, scorecards: [], result: null, earlier: [],
};
const NOTETAKER = (over: Record<string, unknown> = {}) => ({
  enabled: true, aiDraft: true, provider: null, isPanelist: true, myDraft: false, submitted: false, cancelled: false, transcript: null,
  participants: [{ key: 'candidate', name: 'Priya Raman', role: 'Candidate', consent: 'waiting', canAnswer: true }, { key: 'u2', name: 'Kavya', role: 'Interviewer', consent: 'waiting', canAnswer: true }],
  ...over,
});

beforeEach(() => {
  api.mockReset();
  router.push.mockReset();
  (useRouter as jest.Mock).mockReturnValue(router);
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/interviews/iv1');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'iv1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('HIR-25 notetaker on the interview page', () => {
  it('the card shows when the company has it on; consent goes to the API', async () => {
    const sent: [string, unknown][] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/rbac/me/permissions')) return ['interview:view_assigned'];
      if (init?.method) return (sent.push([path, JSON.parse(String(init.body))]), NOTETAKER());
      if (path === '/hiring/interviews/iv1') return VIEW;
      if (path === '/hiring/interviews/iv1/notetaker') return NOTETAKER();
      return [];
    });
    wrap(<YxInterviewPage />);
    expect(await screen.findByText('Interview notetaker')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I consent' }));
    await waitFor(() => expect(sent).toContainEqual(['/hiring/interviews/iv1/notetaker/consent', { participant: 'me', consent: 'given' }]));
  });

  it('off for the company (the default): no card at all', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return ['interview:view_assigned'];
      if (path === '/hiring/interviews/iv1') return VIEW;
      if (path === '/hiring/interviews/iv1/notetaker') return NOTETAKER({ enabled: false });
      return [];
    });
    wrap(<YxInterviewPage />);
    expect(await screen.findByText('Safety')).toBeInTheDocument();
    expect(screen.queryByText('Interview notetaker')).not.toBeInTheDocument();
  });

  it('with the transcript in, Draft makes the draft and opens the review page', async () => {
    const posted: string[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/rbac/me/permissions')) return ['interview:view_assigned'];
      if (init?.method === 'POST') return (posted.push(path), {});
      if (path === '/hiring/interviews/iv1') return VIEW;
      if (path === '/hiring/interviews/iv1/notetaker') return NOTETAKER({ participants: NOTETAKER().participants.map((p) => ({ ...p, consent: 'given' })), transcript: { addedAt: '2026-11-12T05:00:00Z', addedBy: 'Kavya' } });
      return [];
    });
    wrap(<YxInterviewPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Draft my scorecard from the transcript' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/yx/hiring/interviews/iv1/draft'));
    expect(posted).toEqual(['/hiring/interviews/iv1/notetaker/draft']);
  });
});

describe('HIR-25 draft review page', () => {
  it('the panellist confirms the ratings and submits their own scorecard', async () => {
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return (posted.push([path, JSON.parse(String(init.body))]), { status: 'submitted' });
      if (path === '/hiring/interviews/iv1/notetaker/draft') return { candidate: 'Priya Raman', scaleMax: 4, items: [{ itemId: 'a', skill: 'Safety', rating: 3, note: 'Named the lockout steps.', quote: 'Lock out first.' }] };
      return [];
    });
    wrap(<YxDraftScorecardPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm 3' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Strong yes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit scorecard' }));
    await waitFor(() => expect(posted).toEqual([['/hiring/interviews/iv1/scorecard/submit', { ratings: [{ itemId: 'a', rating: 3, notes: 'Named the lockout steps.' }], recommendation: 'strong_yes' }]]));
    expect(router.push).toHaveBeenCalledWith('/yx/hiring/interviews/iv1');
  });

  it('no draft for this person: says so', async () => {
    api.mockRejectedValue(Object.assign(new Error('There is no draft for you on this interview.'), { status: 404 }));
    wrap(<YxDraftScorecardPage />);
    expect(await screen.findByText('There is no draft for you on this interview.')).toBeInTheDocument();
  });
});
