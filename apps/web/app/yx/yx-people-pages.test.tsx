import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxAppLayout from './(app)/layout';
import YxJobHistoryPage from './(app)/people/history/page';
import YxJobChangesPage from './(app)/people/changes/page';
import YxRestructurePage from './(app)/people/restructure/page';
import YxRestructureRecordPage from './(app)/people/restructure/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { name: 'Divya Raghunathan', email: 'divya.r@kaverifoods.in' } }) }));

// People › Job history and Job changes wired to the /people API (P06).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const PERMS_PATH = '/rbac/me/permissions';
const PERSON = { id: 'p-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142', legalEntityId: 'le-1', designation: 'Quality Analyst', department: 'Quality', location: 'Bengaluru head office' };
const HEADER = { id: 'p-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142', legalEntity: { id: 'le-1', name: 'Kaveri Foods Pvt Ltd' }, joinedOn: '2024-07-01', exitedOn: null };
const FACTS = {
  location: { id: 'loc-1', name: 'Bengaluru head office', state: 'IN-KA', timezone: 'Asia/Kolkata' },
  department: { id: 'd-1', name: 'Quality' },
  designation: { id: 'des-1', name: 'Quality Analyst' },
  grade: { id: 'g-1', name: 'G2 · Executive' },
  employmentType: { id: 'et-1', name: 'Permanent' },
  manager: { id: 'p-divya', name: 'Divya Raghunathan' },
  costCentres: [],
};
const asOf = (pay: boolean) => ({ employee: HEADER, asOf: '2026-10-06', assignment: { ...FACTS, validFrom: '2024-07-01', validTo: null }, status: { status: 'confirmed', validFrom: '2024-07-01', validTo: null }, payAccess: true, compensation: pay ? { currency: 'INR', annualCtc: '583200.00', validFrom: '2026-04-01', validTo: null } : null });
const HISTORY = { employee: HEADER, payAccess: true, changes: [], assignment: [], status: [], compensation: [] };
const CHANGE = {
  id: 'c-1', employeeId: 'p-arjun', employeeName: 'Arjun Kulkarni', changeType: 'promotion', effectiveDate: '2026-11-01', status: 'pending', reason: 'Promotion after the review', overrideReason: null,
  retro: false, requestedAt: '2026-10-01T10:00:00Z', decidedAt: null, decisionNote: null, touchesPay: false, payload: {}, impact: null,
};
const IMPACT = { effectiveDate: '2026-11-01', facts: [{ fact: 'Designation', from: 'Quality Analyst', to: 'Senior QA Engineer' }], pay: [], rebased: [], retro: null };

const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/people/history');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});


describe('/yx/people/history', () => {
  it('shows the chosen person; pay is asked for only after Show pay (R1)', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('person=p-arjun'));
    route({
      [`GET ${PERMS_PATH}`]: [],
      'GET /people/employees': [PERSON],
      'GET /people/employees/p-arjun/as-of': (path: string) => asOf(path.includes('pay=true')),
      'GET /people/employees/p-arjun/history': HISTORY,
    });
    wrap(<YxJobHistoryPage />);
    expect(await screen.findByText('Divya Raghunathan')).toBeInTheDocument();
    expect(api.mock.calls.map((c) => c[0]).filter((p: string) => p.includes('pay=true'))).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show pay' }));
    expect(await screen.findByText('₹5,83,200')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(expect.stringMatching(/as-of\?date=\d{4}-\d{2}-\d{2}&pay=true$/), {}, 'tok');
  });

  it('no person chosen: a picker and what to do', async () => {
    route({ [`GET ${PERMS_PATH}`]: [], 'GET /people/employees': [PERSON] });
    wrap(<YxJobHistoryPage />);
    expect(await screen.findByText('Choose a person to see their job history.')).toBeInTheDocument();
  });
});

describe('/yx/people/changes', () => {
  it('Review previews the impact, then Approve posts the approval', async () => {
    const posted: unknown[] = [];
    route({
      [`GET ${PERMS_PATH}`]: ['employee.profile.view', 'employee.change.approve'],
      'GET /people/changes': [CHANGE],
      'GET /people/changes/c-1/preview': IMPACT,
      'POST /people/changes/c-1/approve': (_: string, init: RequestInit) => {
        posted.push(JSON.parse(String(init.body)));
        return { ...CHANGE, status: 'scheduled' };
      },
    });
    wrap(<YxJobChangesPage />);
    // PPL-04: the designed Change action page lists what waits for approval; Open reviews one.
    expect(await screen.findByText(/Arjun Kulkarni · /)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(await screen.findByText('Senior QA Engineer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(posted).toEqual([{ confirmRebase: false }]));
  });

  it('pending inter-entity transfers wait in the same list; Open goes to that restructure (founder 28 Oct 2026)', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
    route({
      [`GET ${PERMS_PATH}`]: ['employee.profile.view', 'employee.change.manage', 'employee.change.approve'],
      'GET /people/changes': [CHANGE],
      'GET /people/restructures/pending-transfers': [{ id: 'r-1', employeeId: 'p-kavya', name: 'Kavya Reddy', effectiveDate: '2026-11-01', waitingFor: ['Karthik Subramanian'], requestedAt: '2026-10-27T10:00:00Z' }],
    });
    wrap(<YxJobChangesPage />);
    expect(await screen.findByText('Kavya Reddy · Inter-entity transfer')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for approval \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/waiting for Karthik Subramanian/)).toBeInTheDocument();
    const row = screen.getByText('Kavya Reddy · Inter-entity transfer').closest('li') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Open' }));
    expect(push).toHaveBeenCalledWith('/yx/people/restructure/r-1');
  });
});

describe('/yx/people/restructure as payroll (founder 28 Oct 2026)', () => {
  const PAYROLL = ['employee.profile.view', 'employee.change.approve', 'payroll.run.prepare'];
  const DONE = { id: 'r-1', kind: 'merge', title: 'Merge Entity TN into Entity KF', from: 'Entity TN', into: 'Entity KF', effectiveDate: '2026-10-01', status: 'done', count: 1, moved: 1, failed: 0, requestedBy: 'Divya Raghunathan', mine: false };

  it('lists only the finished restructures (no plan wizard); Open goes to the record', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
    route({ [`GET ${PERMS_PATH}`]: PAYROLL, 'GET /people/restructures': [{ ...DONE, openItems: 2 }] });
    wrap(<YxRestructurePage />);
    expect(await screen.findByText('Merge Entity TN into Entity KF')).toBeInTheDocument();
    // No plan wizard: its steps and set-up are never asked for.
    expect(screen.queryByRole("button", { name: /Save and exit/ })).toBeNull();
    expect(api.mock.calls.map((c) => String(c[0]))).not.toContainEqual(expect.stringMatching(/restructures\/(setup|drafts)/));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(push).toHaveBeenCalledWith('/yx/people/restructure/r-1');
  });

  it('the record: no approve, reject, cancel or letters; ticking a checklist item shows a toast', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'r-1' });
    let item = { id: 'i-1', key: 'form12b', title: 'Form 12B collected', owner: 'Payroll', dueOn: null, status: 'open', note: null, version: 1, canSet: true };
    // HR's item: visible to payroll with its owner, never ticked by it (founder 28 Oct 2026).
    const hrItem = { id: 'i-2', key: 'costcentre', title: 'Cost centre: choose one of Entity KF', owner: 'HR', dueOn: null, status: 'open', note: null, version: 1, canSet: false };
    const puts: unknown[] = [];
    route({
      [`GET ${PERMS_PATH}`]: PAYROLL,
      'GET /people/restructures/r-1': { ...DONE, reason: 'One company', decidedBy: 'Karthik', decidedAt: '2026-10-01T10:00:00Z', decisionNote: null, canDecide: false, canCancel: false, people: [{ employeeId: 'p-arjun', name: 'Arjun Kulkarni', status: 'moved', reason: null, result: null, openItems: 1 }] },
      'GET /people/restructures/continuity': () => [item, hrItem],
      'PUT /people/restructures/continuity/i-1': (_: string, init: RequestInit) => {
        puts.push(JSON.parse(String(init.body)));
        item = { ...item, status: 'done', version: 2 };
        return { id: 'i-1', status: 'done' };
      },
    });
    wrap(<YxRestructureRecordPage />);
    expect(await screen.findByText('Merge Entity TN into Entity KF')).toBeInTheDocument();
    for (const name of [/Approve/, /^Reject$/, /Cancel restructure/, /Issue transfer letters/]) expect(screen.queryByRole('button', { name })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Continuity checklist/ }));
    expect(await screen.findByText('Cost centre: choose one of Entity KF')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark done' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(puts).toEqual([{ done: true, version: 1 }]));
    expect((await screen.findAllByText('“Form 12B collected” done')).length).toBeGreaterThan(0);
  });
});
