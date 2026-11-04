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
import YxReportMisconductPage from './(app)/desk/report-misconduct/page';

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
    api.mockImplementation(async (path: string) => (path === '/desk/accidents/mine' ? [] : [{ id: 'c1', ref: 'GRV-0001', kind: 'grievance', role: 'reporter', stage: 'Being looked into', status: 'open', next: { label: 'Committee decision', on: '2026-12-03' }, unread: 0 }]));
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
    api.mockImplementation(async (path: string) => {
      if (path === '/desk/cases/disciplinary/people') throw err(403);
      if (path === '/desk/accidents' || path === '/desk/disputes') return [];
      if (path === '/desk/disputes/form') throw err(404);
      return [{ id: 'k1', ref: 'WB-0001', kind: 'whistleblower', subject: 'Bribery', location: '—', stage: 'Received', raisedBy: null, anonymous: true, owner: 'Rekha', next: null, overdue: false, status: 'open' }];
    });
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

describe('Helpdesk › Cases · disciplinary (HLP-08, answer 34)', () => {
  it('HR with the key opens a show-cause case; without it there is no button', async () => {
    api.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/desk/cases/disciplinary/people') return { people: [{ id: 'u-manoj', name: 'Manoj Kumar', email: 'manoj@kf.in' }] };
      if (path === '/desk/cases/disciplinary' && opts?.method === 'POST') return { id: 'k9', ref: 'DSC-0001' };
      return [];
    });
    const { unmount } = wrap(<YxCasesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open a case' }));
    await userEvent.click(screen.getByRole('combobox', { name: /Employee/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Manoj Kumar/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /^Misconduct/ }), 'Absence without leave');
    await userEvent.type(screen.getByRole('textbox', { name: /Facts relied on/ }), 'Absent five working days without leave.');
    await userEvent.click(screen.getByRole('button', { name: 'Open the case' }));
    expect(await screen.findByText('Case opened')).toBeInTheDocument();
    const call = api.mock.calls.find(([p, o]) => p === '/desk/cases/disciplinary' && o?.method === 'POST')!;
    expect(JSON.parse(call[1].body)).toEqual({ employeeUserId: 'u-manoj', misconduct: 'Absence without leave', facts: 'Absent five working days without leave.' });
    expect(push).toHaveBeenCalledWith('/yx/desk/cases/k9');
    unmount();
    api.mockImplementation(async (path: string) => {
      if (path === '/desk/cases/disciplinary/people') throw err(403);
      return [];
    });
    wrap(<YxCasesPage />);
    expect(await screen.findByText("You're not on any case.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open a case' })).not.toBeInTheDocument();
  });
});

describe('Helpdesk › Report misconduct and reports from managers (HLP-08, answer 55)', () => {
  it('a manager sends a report about someone who reports to them', async () => {
    api.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/desk/my/misconduct-reports/people') return { people: [{ id: 'u-manoj', name: 'Manoj Kumar', email: 'manoj@kf.in' }] };
      if (path === '/desk/my/misconduct-reports' && opts?.method === 'POST') return { id: 'r1', ref: 'DSC-0003' };
      return [{ id: 'r0', ref: 'DSC-0002', employee: 'Manoj Kumar', filedOn: '2026-11-01', status: 'declined' }];
    });
    wrap(<YxReportMisconductPage />);
    expect(await screen.findByText('Declined by HR')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: /About/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Manoj Kumar/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /What happened, in short/ }), 'Rude to a customer');
    await userEvent.type(screen.getByRole('textbox', { name: /^Facts/ }), 'Shouted at a customer on 2 Nov.');
    await userEvent.click(screen.getByRole('button', { name: 'Send to HR' }));
    const call = await (async () => {
      for (let i = 0; i < 20 && !api.mock.calls.some(([p, o]) => p === '/desk/my/misconduct-reports' && o?.method === 'POST'); i++) await new Promise((r) => setTimeout(r, 25));
      return api.mock.calls.find(([p, o]) => p === '/desk/my/misconduct-reports' && o?.method === 'POST')!;
    })();
    expect(JSON.parse(call[1].body)).toEqual({ employeeUserId: 'u-manoj', misconduct: 'Rude to a customer', facts: 'Shouted at a customer on 2 Nov.' });
  });

  it('HR with the key sees the reports from managers and declines one with a reason', async () => {
    api.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/desk/cases/disciplinary/people') return { people: [] };
      if (path === '/desk/cases/disciplinary/drafts') return [{ id: 'r1', ref: 'DSC-0003', employee: 'Manoj Kumar', reportedBy: 'Ravi', filedOn: '2026-11-02', misconduct: 'Rude to a customer', facts: 'Shouted.', happenedOn: null }];
      if (opts?.method === 'POST') return { declined: true };
      return [];
    });
    wrap(<YxCasesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Why/ }), 'A word with him is enough.');
    await userEvent.click(screen.getAllByRole('button', { name: 'Decline' }).at(-1)!);
    expect((await screen.findAllByText('DSC-0003 declined')).length).toBeGreaterThan(0);
    const call = api.mock.calls.find(([p]) => p === '/desk/cases/disciplinary/drafts/r1/decline')!;
    expect(JSON.parse(call[1].body)).toEqual({ reason: 'A word with him is enough.' });
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
