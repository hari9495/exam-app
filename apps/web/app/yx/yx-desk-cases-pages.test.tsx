import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxMyCasesPage from './(app)/desk/my-cases/page';
import YxCasesPage from './(app)/desk/cases/page';
import YxCasePage from './(app)/desk/cases/[id]/page';
import YxEthicsDeskPage from './(app)/desk/ethics/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › My cases, Cases and Ethics desk (HLP-07/08/09): the designed screens with `live` on the cases API.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const err = (status: number) => Object.assign(new Error('No'), { status });
const push = jest.fn();
const replace = jest.fn();

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  replace.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › My cases (HLP-07 live)', () => {
  it('lists my part of each case; a row opens it; acting for someone else shows no access', async () => {
    api.mockResolvedValue([{ id: 'c1', ref: 'GRV-0001', kind: 'grievance', role: 'reporter', stage: 'Being looked into', status: 'open', next: { label: 'Committee decision', on: '2026-12-03' }, unread: 0 }]);
    const { unmount } = wrap(<YxMyCasesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(replace).toHaveBeenCalledWith('/yx/desk/my-cases?case=c1');
    expect(api).toHaveBeenCalledWith('/desk/my/cases', {}, 'tok');
    unmount();
    api.mockRejectedValue(err(403));
    wrap(<YxMyCasesPage />);
    expect(await screen.findByText(/closed while you act for someone else/)).toBeInTheDocument();
  });
});

describe('Helpdesk › Cases (HLP-08 live)', () => {
  it('the list opens a case; a case I am not on shows Not found', async () => {
    api.mockImplementation(async (path: string) => (path === '/desk/accidents' ? [] : [{ id: 'k1', ref: 'WB-0001', kind: 'whistleblower', subject: 'Bribery', location: '—', stage: 'Received', raisedBy: null, anonymous: true, owner: 'Rekha', next: null, overdue: false, status: 'open' }]));
    const { unmount } = wrap(<YxCasesPage />);
    await userEvent.click(await screen.findByText('Bribery'));
    expect(push).toHaveBeenCalledWith('/yx/desk/cases/k1');
    unmount();
    (useParams as jest.Mock).mockReturnValue({ id: 'k9' });
    api.mockRejectedValue(err(404));
    wrap(<YxCasePage />);
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });
});

describe('Helpdesk › Ethics desk (HLP-09 live)', () => {
  it('routes a report to the chair with the reason', async () => {
    api.mockImplementation(async (path: string) => (path === '/desk/ethics/reports' ? [{ id: 'w1', ref: 'WB-0002', subject: 'Invoices', receivedOn: '2026-11-01', entity: 'Kaveri', anonymous: true, severity: null, routed: false, stage: 'Received', clock: null, aboutOfficer: false }] : { routed: true }));
    wrap(<YxEthicsDeskPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Route to chair' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'A senior manager approved it.');
    await userEvent.click(screen.getAllByRole('button', { name: 'Route to chair' }).at(-1)!);
    const call = api.mock.calls.find(([p]) => p === '/desk/ethics/reports/w1/route')!;
    expect(JSON.parse(call[1].body)).toEqual({ reason: 'A senior manager approved it.' });
  });
});
