import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDisputePage from './(app)/desk/disputes/[id]/page';
import YxCasesPage from './(app)/desk/cases/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchAnonymous: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › collective disputes (HLP-13): the designed screen with `live`, positive and negative.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const push = jest.fn();
const err = (status: number) => Object.assign(new Error(status === 404 ? 'Not found.' : 'Refused.'), { status });
const DETAIL = {
  id: 'ird1',
  number: 'IRD-0001',
  title: 'Charter of demands 2026',
  unionName: 'Kaveri Foods Workers Union',
  location: 'Hosur plant',
  workersCovered: 212,
  receivedOn: '2026-09-25',
  recordedBy: 'Harish',
  stage: 'Settlement to approve',
  demands: [],
  meetings: [],
  papers: [],
  nextMeeting: null,
  settlement: {
    status: 'proposed',
    terms: { kind: 'bipartite', signedOn: '2026-11-03', effectiveFrom: '2026-04-01', effectiveTo: null, covered: 'All workers', terms: 'Basic +11 %', rates: [{ category: 'skilled', monthlyIncrease: '1500' }], paper: null },
    proposedBy: 'Harish',
    proposedAt: '2026-11-03T10:00:00Z',
    proposedByMe: false,
    approvedBy: null,
    approvedAt: null,
    wageSettlementId: null,
    sentBack: null,
    canApprove: true,
  },
  filed: null,
  closed: null,
  clocks: [],
  source: null,
  members: [{ name: 'Harish', role: 'Industrial relations team', access: 'Full dispute record', external: false }],
};
const ROW = { id: 'ird1', ref: 'IRD-0001', kind: 'dispute', subject: 'Charter of demands 2026', location: 'Hosur plant', stage: 'Conciliation', raisedBy: 'Kaveri Foods Workers Union', anonymous: false, owner: 'Industrial relations team', next: null, overdue: false, status: 'open' };

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
  (useParams as jest.Mock).mockReturnValue({ id: 'ird1' });
});

describe('Helpdesk › Collective dispute (HLP-13 live)', () => {
  it('a second IR member approves: the page posts the approval and shows the toast', async () => {
    api.mockImplementation(async (path: string, opts?: { method?: string }) => (opts?.method === 'POST' ? { wageSettlementId: 'ws1' } : DETAIL));
    wrap(<YxDisputePage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Approve and send to payroll' }))[0]);
    expect(api).toHaveBeenCalledWith('/desk/disputes/ird1/settlement/approve', { method: 'POST' }, 'tok');
    expect((await screen.findAllByText('Settlement approved and sent to payroll arrears')).length).toBeGreaterThan(0);
  });

  it('someone off the IR team sees Not found', async () => {
    api.mockRejectedValue(err(404));
    wrap(<YxDisputePage />);
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });

  it('the Cases list shows dispute rows to the IR team, opens them, and records a new one', async () => {
    api.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/desk/disputes' && opts?.method === 'POST') return { id: 'ird9', number: 'IRD-0009' };
      if (path === '/desk/disputes') return [ROW];
      if (path === '/desk/disputes/form') return { locations: [{ id: 'hsr', name: 'Hosur plant' }] };
      if (path === '/desk/cases/disciplinary/people') throw err(403);
      return [];
    });
    wrap(<YxCasesPage />);
    await userEvent.click(await screen.findByText('Charter of demands 2026'));
    expect(push).toHaveBeenCalledWith('/yx/desk/disputes/ird1');
    await userEvent.click(screen.getByRole('button', { name: 'Record a dispute' }));
    const d = await screen.findByRole('dialog', { name: 'Record a dispute' });
    await userEvent.type(within(d).getByRole('textbox', { name: /^Dispute/ }), 'Bonus demand 2026');
    await userEvent.type(within(d).getByRole('textbox', { name: /Raised by/ }), 'Kaveri Foods Workers Union');
    await userEvent.type(within(d).getByRole('textbox', { name: /Workers covered/ }), '40');
    await userEvent.type(within(d).getByRole('textbox', { name: /Charter received on/ }), '02 Nov 2026');
    await userEvent.click(within(d).getByRole('button', { name: 'Record dispute' }));
    const call = api.mock.calls.find(([p, o]) => p === '/desk/disputes' && o?.method === 'POST')!;
    expect(JSON.parse(call[1].body)).toEqual({ title: 'Bonus demand 2026', unionName: 'Kaveri Foods Workers Union', locationId: 'hsr', workersCovered: 40, receivedOn: '2026-11-02' });
    expect(push).toHaveBeenCalledWith('/yx/desk/disputes/ird9');
  });

  it('answer 85: a location with payroll register unions offers that list; the page sends the union id', async () => {
    api.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/desk/disputes' && opts?.method === 'POST') return { id: 'ird4', number: 'IRD-0004' };
      if (path === '/desk/disputes/form') return { locations: [{ id: 'hsr', name: 'Hosur plant', unions: [{ id: 'un1', name: 'Kaveri Foods Workers Union' }] }] };
      if (path === '/desk/cases/disciplinary/people') throw err(403);
      return [];
    });
    wrap(<YxCasesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Record a dispute' }));
    const d = await screen.findByRole('dialog', { name: 'Record a dispute' });
    await userEvent.type(within(d).getByRole('textbox', { name: /^Dispute/ }), 'Wage revision 2027');
    await userEvent.click(within(d).getByRole('combobox', { name: /Raised by/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Kaveri Foods Workers Union' }));
    await userEvent.type(within(d).getByRole('textbox', { name: /Workers covered/ }), '180');
    await userEvent.type(within(d).getByRole('textbox', { name: /Charter received on/ }), '02 Nov 2026');
    await userEvent.click(within(d).getByRole('button', { name: 'Record dispute' }));
    const call = api.mock.calls.find(([p, o]) => p === '/desk/disputes' && o?.method === 'POST')!;
    expect(JSON.parse(call[1].body)).toEqual({ title: 'Wage revision 2027', unionId: 'un1', locationId: 'hsr', workersCovered: 180, receivedOn: '2026-11-02' });
    expect(push).toHaveBeenCalledWith('/yx/desk/disputes/ird4');
  });

  it('off the IR team: no dispute rows and no Record a dispute button', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/desk/disputes/form') throw err(404);
      if (path === '/desk/cases/disciplinary/people') throw err(403);
      return [];
    });
    wrap(<YxCasesPage />);
    expect(await screen.findByText("You're not on any case.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record a dispute' })).not.toBeInTheDocument();
  });
});
