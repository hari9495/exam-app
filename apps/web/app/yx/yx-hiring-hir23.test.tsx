import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav } from '../../lib/yx-nav';
import YxBiasAuditsPage from './(app)/hiring/bias-audits/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// HIR-23 Bias audits on the API (founder decision 2, question 7): positive and negative.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const VIEW = (over: Record<string, unknown> = {}) => ({
  canEdit: true,
  nycOn: true,
  law: { name: 'NYC Local Law 144', categories: { sex: ['Female', 'Male'], race: ['Asian'] } },
  valid: true,
  validUntil: '2027-03-12',
  tools: { rediscoveryAi: true, aiDraft: false },
  audits: [{ id: 'a1', auditedOn: '2026-03-12', auditor: 'Hudson Fairness Auditors LLC', summaryUrl: 'https://example.com/a', results: { sex: [{ label: 'Female', assessed: 100, selected: 30 }, { label: 'Male', assessed: 120, selected: 40 }], race: [{ label: 'Asian', assessed: 220, selected: 70 }] } }],
  ...over,
});

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/bias-audits');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', impersonating: false, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('HIR-23 Bias audits page', () => {
  it('shows the latest audit, valid until, and the tools it covers; the report opens', async () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    api.mockImplementation(async (path: string) => (path === '/hiring/bias-audits' ? VIEW() : path === '/hiring/bias-audits/a1/report' ? { url: 'https://blob.test/a.pdf' } : []));
    wrap(<YxBiasAuditsPage />);
    expect(await screen.findByText('Audit valid')).toBeInTheDocument();
    expect(screen.getByText('Bias audit · AI notes on past candidates')).toBeInTheDocument();
    expect(screen.getByText('12 Mar 2027')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open audit report' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://blob.test/a.pdf', '_blank', 'noopener'));
    open.mockRestore();
  });

  it('overdue: blocked for New York City jobs; the record form lists the law’s categories', async () => {
    api.mockImplementation(async () => VIEW({ valid: false, validUntil: '2026-08-20', audits: [] }));
    wrap(<YxBiasAuditsPage />);
    expect(await screen.findByText(/is blocked for New York City jobs/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Record audit' }));
    expect(screen.getByRole('textbox', { name: 'Female · assessed' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Asian · selected' })).toBeInTheDocument();
  });

  it('acting for someone else: no Record audit; the NYC setting off: not applicable', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', impersonating: true, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    api.mockImplementation(async () => VIEW());
    const { unmount } = wrap(<YxBiasAuditsPage />);
    expect(await screen.findByText('Audit valid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record audit' })).not.toBeInTheDocument();
    unmount();
    api.mockImplementation(async () => VIEW({ nycOn: false }));
    wrap(<YxBiasAuditsPage />);
    expect(await screen.findByText("Bias audits aren't needed for your company.")).toBeInTheDocument();
  });

  it('a load failure shows the error state', async () => {
    api.mockRejectedValue(Object.assign(new Error('down'), { status: 500 }));
    wrap(<YxBiasAuditsPage />);
    expect(await screen.findByText('Bias audits could not be loaded.')).toBeInTheDocument();
  });

  it('menu: Bias audits for recruiting and the hiring settings holders only', () => {
    const base = { role: 'panel', support: false, employee: true, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
    const links = (has: (k: string) => boolean) => (buildNav({ ...base, has }).find((a) => a.id === 'hire')?.sections ?? []).flatMap((s) => s.items.map((i) => i.href));
    expect(links((k) => k === 'ats.settings.manage')).toContain('/yx/hiring/bias-audits');
    expect(links((k) => k === 'pipeline:manage')).toContain('/yx/hiring/bias-audits');
    expect(links(() => false)).not.toContain('/yx/hiring/bias-audits');
  });
});
