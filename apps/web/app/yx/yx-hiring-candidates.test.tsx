import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHiringCandidatesPage from './(app)/hiring/candidates/page';
import YxHiringCandidatePage from './(app)/hiring/candidates/[id]/page';
import YxHiringRetentionPage from './(app)/hiring/retention/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › Candidates, a candidate, and retention on the API (M10 batch AT4).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;
const router = { push: jest.fn(), replace: jest.fn() };
const PERMS = { 'candidate:manage': true, 'candidate:view': true, 'candidate:data_rights': true, 'org.settings.manage': true };

beforeEach(() => {
  api.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
  (useRouter as jest.Mock).mockReturnValue(router);
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/candidates');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'c1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const common = (path: string) => {
  if (path.startsWith('/rbac/me/permissions')) return Object.keys(PERMS);
  if (path.startsWith('/exams')) return { data: [{ id: 'e1', title: 'Aptitude' }], total: 1 };
  if (path.startsWith('/jobs')) return [];
  if (path.startsWith('/custom-fields')) return [];
  if (path === '/candidate-email-templates') return [];
  if (path.startsWith('/organizations/sender-addresses') || path.startsWith('/org-sender-addresses')) return [];
  if (path === '/hiring/pools') return [];
  if (path === '/hiring/duplicates') return [];
  return undefined;
};

describe('Hiring › Candidates (M10 AT4)', () => {
  it('lists candidates and adds one on the same API', async () => {
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/candidates?')) return { data: [{ id: 'c1', name: 'Priya Raman', email: 'priya@example.com', phone: null, status: 'active', globalStage: 'engaged', createdAt: '2026-09-01T00:00:00.000Z', erasedAt: null, invitationCount: 1 }], total: 1, page: 1, pageSize: 25 };
      if (path === '/candidates' && init?.method === 'POST') return (posted.push(JSON.parse(String(init.body))), {});
      const c = common(path);
      if (c !== undefined) return c;
      return [];
    });
    wrap(<YxHiringCandidatesPage />);
    expect(await screen.findByText('Priya Raman')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add candidate' }));
    const d = screen.getByRole('dialog');
    await userEvent.type(within(d).getByLabelText(/^Name/), 'Divya S');
    await userEvent.type(within(d).getByLabelText(/^Email/), 'divya@example.com');
    await userEvent.click(within(d).getByRole('button', { name: 'Add candidate' }));
    await waitFor(() => expect(posted).toEqual([{ name: 'Divya S', email: 'divya@example.com' }]));
  });

  it('a merged-away candidate opens the kept one', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/hiring/candidates/c1') return { mergedIntoId: 'c2' };
      if (path.startsWith('/candidates?')) return { data: [], total: 0 };
      const c = common(path);
      return c === undefined ? [] : c;
    });
    wrap(<YxHiringCandidatePage />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/yx/hiring/candidates/c2'));
  });

  it('retention: a preview sends dryRun true', async () => {
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/hiring/retention/runs') return { months: 18, runs: [] };
      if (path === '/hiring/retention/run') return (posted.push(JSON.parse(String(init!.body))), { periodMonths: 18, renewalsSent: 1, anonymised: 0, skippedHold: 0, skippedOpen: 0, skippedHired: 0 });
      const c = common(path);
      return c === undefined ? [] : c;
    });
    wrap(<YxHiringRetentionPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Preview (changes nothing)' }));
    expect(await screen.findByText(/1 renewal emails, 0 anonymised/)).toBeInTheDocument();
    expect(posted).toEqual([{ dryRun: true }]);
  });
});
