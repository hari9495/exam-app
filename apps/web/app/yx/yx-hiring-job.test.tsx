import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxInterviewPage from './(app)/hiring/interviews/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › one interview on the API (M10 batch AT5). The old job list page is gone (founder answer 261): its settings are
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
    await userEvent.click(within(await screen.findByRole('radiogroup', { name: 'Safety' })).getByRole('radio', { name: '3' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Strong yes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit scorecard' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit scorecard' }));
    await waitFor(() => expect(posted).toEqual([{ ratings: [{ itemId: 'a', rating: 3, notes: null }], recommendation: 'strong_yes', summary: null }]));
  });
});
