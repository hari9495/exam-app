import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxInterviewPage from './(app)/hiring/interviews/[id]/page';
import YxInterviewsPage from './(app)/hiring/interviews/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › interviews (HIR-06) and one interview (HIR-07) on the API, the designed screens with `live`. The old job list page is gone (founder answer 261): its settings are
// tested on the job workspace (yx-hiring-jobs.test.tsx), its bulk actions on the board (yx-hiring-hir04.test.tsx).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;
const router = { push: jest.fn(), replace: jest.fn() };

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue(router);
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/jobs/j1');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'j1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Hiring › one interview (M10 AT5, D7)', () => {
  it('submits the panellist’s scorecard', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'iv1' });
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/rbac/me/permissions')) return ['interview:view_assigned'];
      if (path === '/hiring/interviews/iv1') return {
        interview: { id: 'iv1', status: 'confirmed', location: 'Room 4', timeZone: 'Asia/Kolkata', meetingUrl: null, slots: [], jobId: 'j1', jobTitle: 'Plant Engineer', candidateId: 'c1', candidateName: 'Priya Raman' },
        panel: [{ userId: 'u2', name: 'Kavya', submitted: false }], resume: null,
        template: { id: 'tp1', name: 'Round 1', scaleMax: 4, passBar: 2.5, items: [{ id: 'a', label: 'Safety', guidance: null, weight: 1 }] },
        viewer: { isPanelist: true, isOverseer: false }, scorecards: [], result: null, earlier: [],
      };
      if (path === '/hiring/interviews/iv1/scorecard/submit') return (posted.push(JSON.parse(String(init!.body))), { status: 'submitted' });
      return [];
    });
    wrap(<YxInterviewPage />);
    await userEvent.click(within(await screen.findByRole('radiogroup', { name: 'Safety rating' })).getByRole('radio', { name: '3' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Strong yes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit scorecard' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit scorecard' }));
    await waitFor(() => expect(posted).toEqual([{ ratings: [{ itemId: 'a', rating: 3, notes: null }], recommendation: 'strong_yes', summary: null }]));
  });

  it('a refused save (acting for someone else) keeps the form and shows why', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'iv1' });
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/rbac/me/permissions')) return ['interview:view_assigned'];
      if (path === '/hiring/interviews/iv1' && !init?.method) return {
        interview: { id: 'iv1', status: 'confirmed', location: 'Room 4', timeZone: 'Asia/Kolkata', meetingUrl: null, slots: [], jobId: 'j1', jobTitle: 'Plant Engineer', candidateId: 'c1', candidateName: 'Priya Raman' },
        panel: [{ userId: 'u2', name: 'Kavya', submitted: false }], resume: null,
        template: { id: 'tp1', name: 'Round 1', scaleMax: 4, passBar: 2.5, items: [{ id: 'a', label: 'Safety', guidance: null, weight: 1 }] },
        viewer: { isPanelist: true, isOverseer: false }, scorecards: [], result: null, earlier: [],
      };
      if (path === '/hiring/interviews/iv1/scorecard') throw Object.assign(new Error('Not available while acting for someone else'), { status: 403 });
      return [];
    });
    wrap(<YxInterviewPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Not available while acting for someone else')).toBeInTheDocument();
  });
});

describe('Hiring › interviews (HIR-06)', () => {
  it('an interviewer sees the scorecards they owe and the calendar loads a two-month range', async () => {
    const asked: string[] = [];
    api.mockImplementation(async (path: string) => {
      asked.push(path);
      if (path.startsWith('/rbac/me/permissions')) return ['interview:view_assigned'];
      if (path === '/hiring/interviews/mine') return [{ id: 'iv1', candidateName: 'Priya Raman', jobTitle: 'Plant Engineer', when: '2026-09-29T05:30:00.000Z', status: 'confirmed', scorecard: 'not_started', overdue: true }];
      return [];
    });
    wrap(<YxInterviewsPage />);
    expect(await screen.findByText('Scorecard overdue')).toBeInTheDocument();
    expect(screen.getByText(/29 Sep 2026, 11:00 am IST/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fill scorecard for Priya Raman' }));
    expect(router.push).toHaveBeenCalledWith('/yx/hiring/interviews/iv1');
    const range = asked.find((p) => p.startsWith('/hiring/interviews?'))!;
    const q = new URLSearchParams(range.split('?')[1]);
    expect(Date.parse(q.get('to')!) - Date.parse(q.get('from')!)).toBe(62 * 86_400_000);
  });

  it('no interview key: no access', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return [];
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    });
    wrap(<YxInterviewsPage />);
    expect((await screen.findAllByText(/access/i)).length).toBeGreaterThan(0);
  });
});
