import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxVisitorDeskPage from './(app)/visitors/page';
import YxMyVisitorsPage from './(app)/visitors/invites/page';
import YxVisitorLogPage from './(app)/visitors/log/page';
import YxVisitPassPage from './visit/[token]/page';
import YxKioskPage from './kiosk/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ API_BASE: 'http://api', apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Visitors slice 1: the live pages on the visitors API (VIS-01 desk, VIS-02 my visitors, VIS-04 log, T9-14 pass page).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const calls: [string, string, unknown][] = [];
const visit = (over = {}) => ({ id: 'v1', name: 'Rahul Menon', mobile: '+919840122871', email: 'r@x.test', company: 'Nilgiri', purpose: 'meeting', host: 'Divya', location: 'Chennai office', locationId: 'maa', startsAt: '2026-11-12T08:30:00.000Z', endsAt: '2026-11-12T09:30:00.000Z', status: 'expected', statusText: 'Expected', passCode: 'V-7KQ2-MX4P', badge: null, vehicle: null, noticeAcceptedAt: '2026-11-12T03:00:00Z', checkedInAt: null, checkedOutAt: null, ...over });
const OPTIONS = { locations: [{ value: 'maa', label: 'Chennai office' }], desk: [{ value: 'maa', label: 'Chennai office' }], log: [{ value: 'maa', label: 'Chennai office' }], canSettings: false, acting: false };
const routes = (over: Record<string, unknown> = {}) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      calls.push([method, path, init?.body ? JSON.parse(String(init.body)) : null]);
      if (path.endsWith('/check-in')) return visit({ status: 'on_site', statusText: 'On site', badge: 'V-0413' });
      if (path === '/visitors/invites') return { ...visit({ id: 'v9', name: 'Anjali Varma' }), emailed: true };
      if (path === '/visitors/walk-ins') return visit({ id: 'w9', name: 'Mohan Lal', status: 'waiting', statusText: 'Waiting for host', walkIn: true });
      return {};
    }
    const routesMap: Record<string, unknown> = { '/visitors/options': OPTIONS, '/visitors/desk?locationId=maa': { location: { id: 'maa', name: 'Chennai office' }, today: '2026-11-12', canChange: true, visits: [visit()] }, '/visitors/mine': [visit()], '/visitors/types': { types: [{ id: 't1', name: 'Customer' }], policies: [] }, '/visitors/approvals': [], '/visitors/v1/needs': { notice: { text: 'n', version: 'v-1' }, nda: null, induction: null }, '/visitors/log': { locations: OPTIONS.log, visits: [visit({ status: 'checked_out', statusText: 'Checked out', checkedInAt: '2026-11-12T08:31:00Z', checkedOutAt: '2026-11-12T09:00:00Z', deletedOn: '2027-02-10' })] }, ...over };
    if (path in routesMap) return routesMap[path];
    throw Object.assign(new Error(`unexpected ${path}`), { status: 404 });
  });

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
});

describe('Visitors pages (live)', () => {
  it('desk: today at the first desk location; check in posts to the visit', async () => {
    routes();
    wrap(<YxVisitorDeskPage />);
    expect(await screen.findByText('Rahul Menon')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    await ue.click(within(screen.getByRole('dialog', { name: /Check in Rahul Menon/ })).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(calls).toEqual([['POST', '/visitors/v1/check-in', { noticeAccepted: false }]]));
  });

  it('desk: no Reception role anywhere shows no access', async () => {
    routes({ '/visitors/options': { ...OPTIONS, desk: [] } });
    wrap(<YxVisitorDeskPage />);
    expect(await screen.findByText(/an admin \(the Reception role\)/)).toBeInTheDocument();
  });

  it('my visitors: lists them; acting for someone else cannot invite', async () => {
    routes();
    const { unmount } = wrap(<YxMyVisitorsPage />);
    expect(await screen.findByText('Rahul Menon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite a visitor' })).toBeInTheDocument();
    unmount();
    routes({ '/visitors/options': { ...OPTIONS, acting: true } });
    wrap(<YxMyVisitorsPage />);
    expect(await screen.findByText('Rahul Menon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite a visitor' })).not.toBeInTheDocument();
  });

  it('log: the visits with the export button; a refusal shows no access', async () => {
    routes();
    const { unmount } = wrap(<YxVisitorLogPage />);
    expect(await screen.findByText('Rahul Menon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export for audit' })).toBeInTheDocument();
    unmount();
    api.mockImplementation(async () => {
      throw Object.assign(new Error('The visitor log needs the visitor log or desk key.'), { status: 403 });
    });
    wrap(<YxVisitorLogPage />);
    expect(await screen.findByText(/the Reception or Facility admin role/)).toBeInTheDocument();
  });
});

describe('The visitor’s pass page (T9-14, public)', () => {
  const pv = { state: 'details', visitor: 'Rahul Menon', mobile: '+91 ••••• ••871', company: 'Nilgiri', purpose: 'meeting', host: 'Divya', location: 'Chennai office', address: 'Chennai', window: { from: '2026-11-12T08:30:00.000Z', to: '2026-11-12T09:30:00.000Z' }, vehicle: null, hours: '09:00 to 18:30', retentionDays: 90, notice: 'Wear your badge.', noticeVersion: 'v-abc', passCode: null, brand: { orgName: 'Kaveri Foods' } };
  let fetched: { url: string; method: string; body: unknown }[] = [];
  beforeEach(() => {
    fetched = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      fetched.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/visits/tok/accept')) return { ok: true, status: 200, json: async () => ({ ...pv, state: 'pass', passCode: 'V-7KQ2-MX4P' }) } as Response;
      if (url.endsWith('/visits/tok')) return { ok: true, status: 200, json: async () => pv } as Response;
      return { ok: false, status: 404, json: async () => ({ message: 'This visitor pass link is not valid.' }) } as Response;
    }) as unknown as typeof fetch;
  });

  it('details, notice, then the pass with the version read', async () => {
    (useParams as jest.Mock).mockReturnValue({ token: 'tok' });
    wrap(<YxVisitPassPage />);
    expect(await screen.findByText("You're invited to Chennai office")).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('checkbox', { name: /visitor notice and the privacy notice/ }));
    await ue.click(screen.getByRole('button', { name: 'Get my pass' }));
    await waitFor(() => expect(fetched.find((f) => f.method === 'POST')?.body).toEqual({ noticeVersion: 'v-abc' }));
    expect(await screen.findByText('V-7KQ2-MX4P')).toBeInTheDocument();
  });

  it('an unknown link says so', async () => {
    (useParams as jest.Mock).mockReturnValue({ token: 'nope' });
    wrap(<YxVisitPassPage />);
    expect(await screen.findByText('We could not find this visit.')).toBeInTheDocument();
  });
});

describe('Visitors slice 2 pages (live)', () => {
  it('desk: Add walk-in posts the visitor with the host and what they accepted', async () => {
    routes({
      '/visitors/desk/hosts?locationId=maa&q=': [{ value: 'h1', label: 'Anita Desai' }],
      '/visitors/desk/needs?locationId=maa&mobile=': { notice: { text: 'Wear your badge.', version: 'v-1' }, nda: null, induction: null, inHours: true, hours: '09:00 to 18:30' },
      '/visitors/desk/needs?locationId=maa&mobile=9000011111': { notice: { text: 'Wear your badge.', version: 'v-1' }, nda: null, induction: null, inHours: true, hours: '09:00 to 18:30' },
    });
    wrap(<YxVisitorDeskPage />);
    await ue.click(await screen.findByRole('button', { name: 'Add walk-in' }));
    const d = screen.getByRole('dialog', { name: /Add a walk-in/ });
    await ue.type(within(d).getByLabelText(/^Visitor's name/), 'Mohan Lal');
    await ue.type(within(d).getByLabelText(/^Mobile/), '9000011111');
    await ue.click(within(d).getByRole('combobox', { name: 'Visiting' }));
    await ue.click(await screen.findByRole('option', { name: /Anita Desai/ }));
    await ue.click(within(d).getByRole('checkbox', { name: 'The visitor read and accepted the notice' }));
    await ue.click(within(d).getByRole('button', { name: 'Ask the host' }));
    await waitFor(() => expect(calls).toContainEqual(['POST', '/visitors/walk-ins', expect.objectContaining({ locationId: 'maa', hostUserId: 'h1', name: 'Mohan Lal', noticeVersion: 'v-1' })]));
  });

  it('my visitors: a walk-in card; Approve posts the decision', async () => {
    routes({ '/visitors/approvals': [{ id: 'w1', name: 'Priyanka Sethi', company: 'Fairview', purpose: 'audit', location: 'Chennai office', arrivedAt: '2026-11-12T04:01:00.000Z', dueAt: '2026-11-12T04:11:00.000Z', hasPhoto: false }] });
    wrap(<YxMyVisitorsPage />);
    expect(await screen.findByText('A walk-in is asking for you')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls).toContainEqual(['POST', '/visitors/walk-ins/w1/decide', { approve: true }]));
  });

  it('kiosk: a tablet in visitor mode shows the visitor kiosk with its own secret; a closed one sends to reception', async () => {
    localStorage.setItem('yx-kiosk-token', 'org.secret');
    const seen: string[] = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      seen.push(`${init?.method ?? 'GET'} ${url} ${(init?.headers as Record<string, string>)['x-kiosk-token']}`);
      const body = url.endsWith('/kiosk/me') ? { company: 'Kaveri Foods', location: 'Chennai office', mode: 'visitor', methods: [], code: 'K1', place: 'Lobby', codePrefix: '', codeDigits: 4, pinTries: 5, zone: 'Asia/Kolkata' } : { company: 'Kaveri Foods', location: 'Chennai office', open: false, photo: true, retentionDays: 90, types: [] };
      return { ok: true, status: 200, json: async () => body } as Response;
    }) as unknown as typeof fetch;
    wrap(<YxKioskPage />);
    expect(await screen.findByText('Please see the reception desk')).toBeInTheDocument();
    expect(seen).toContain('GET http://api/visitor-kiosk/me org.secret');
    localStorage.removeItem('yx-kiosk-token');
  });
});

