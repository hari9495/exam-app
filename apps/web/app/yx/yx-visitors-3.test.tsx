import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, apiFetchBlob } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { publicGet, publicPost } from '../../lib/yx-careers';
import YxVisitorDeskPage from './(app)/visitors/page';
import YxVisitorLogPage from './(app)/visitors/log/page';
import YxVisitorWatchListPage from './(app)/visitors/watchlist/page';
import YxVisitPassPage from './visit/[token]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ API_BASE: 'http://api', apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/yx-careers', () => ({ publicGet: jest.fn(), publicPost: jest.fn() }));

// Visitors slice 3 (answers 603, 605, 614): the watch-list page, the ID at the desk, the photo of the ID in the log, the ID on the pass page.
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
const ENTRY = { id: 'w1', name: 'Manish Gupta', mobile: '+919884500712', reason: 'Took photos of the packing line.', addedBy: 'Anita', addedAt: '2026-08-13T10:20:00Z', reviewedBy: null, reviewedAt: null, reviewBy: '2027-08-13T10:20:00Z' };
const routes = (over: Record<string, unknown> = {}) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      calls.push([method, path, init?.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : 'file'])) : init?.body ? JSON.parse(String(init.body)) : null]);
      if (path.endsWith('/check-in')) return visit({ status: 'on_site', statusText: 'On site', badge: 'V-0413' });
      if (path === '/visitors/watchlist') return { id: 'w2', blockedVisits: 1 };
      return {};
    }
    const map: Record<string, unknown> = {
      '/visitors/options': OPTIONS,
      '/visitors/desk?locationId=maa': { location: { id: 'maa', name: 'Chennai office' }, today: '2026-11-12', canChange: true, idCapture: 'with_image', visits: [visit()] },
      '/visitors/log': { locations: OPTIONS.log, visits: [visit({ status: 'checked_out', statusText: 'Checked out', idType: 'passport', idText: 'Passport ··Z123', hasIdImage: true, deletedOn: '2027-02-10' })] },
      '/visitors/watchlist': { canChange: true, reviewDays: 365, entries: [ENTRY] },
      ...over,
    };
    if (path in map) return map[path];
    throw Object.assign(new Error(`unexpected ${path}`), { status: 404 });
  });

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
});

describe('Visitors slice 3 pages (live)', () => {
  it('watch-list: lists the reasons; adds, reviews and removes on the API', async () => {
    routes();
    wrap(<YxVisitorWatchListPage />);
    expect(await screen.findByText('Took photos of the packing line.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add a person' }));
    const d = screen.getByRole('dialog', { name: 'Add a person to the watch-list' });
    await ue.type(within(d).getByLabelText(/^Name/), 'Sunil Rawat');
    await ue.type(within(d).getByLabelText(/^Reason/), 'Abusive to reception staff.');
    await ue.click(within(d).getByRole('button', { name: 'Add to the watch-list' }));
    await ue.click(await screen.findByRole('button', { name: 'Reviewed, keep' }));
    await ue.click(screen.getByRole('button', { name: 'Remove' }));
    await ue.click(within(screen.getByRole('dialog', { name: /Remove Manish Gupta/ })).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(calls).toEqual([
        ['POST', '/visitors/watchlist', { name: 'Sunil Rawat', reason: 'Abusive to reception staff.' }],
        ['POST', '/visitors/watchlist/w1/review', null],
        ['DELETE', '/visitors/watchlist/w1', null],
      ]),
    );
  });

  it('watch-list: without the key the page says no access', async () => {
    routes({ '/visitors/watchlist': undefined });
    api.mockImplementation(async (path: string) => {
      if (path === '/visitors/watchlist') throw Object.assign(new Error('forbidden'), { status: 403 });
      return {};
    });
    wrap(<YxVisitorWatchListPage />);
    expect(await screen.findByText(/HR admin or Facility admin role/)).toBeInTheDocument();
  });

  it('desk: the photo of the ID goes up with its type and last 4, then check-in carries the ID', async () => {
    routes();
    wrap(<YxVisitorDeskPage />);
    await ue.click(await screen.findByRole('button', { name: 'Check in' }));
    const d = screen.getByRole('dialog', { name: /Check in Rahul Menon/ });
    await ue.click(within(d).getByRole('combobox', { name: /ID shown/ }));
    await ue.click(screen.getByRole('option', { name: 'Passport' }));
    await ue.type(within(d).getByLabelText(/Last 4 characters/), 'z123');
    await ue.upload(d.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'id.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(calls[0]).toEqual(['POST', '/visitors/v1/id-image', { idType: 'passport', idLast4: 'Z123', file: 'file' }]));
    await ue.click(within(d).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(calls[1]).toEqual(['POST', '/visitors/v1/check-in', { noticeAccepted: false, idType: 'passport', idLast4: 'Z123' }]));
  });

  it('log: the photo of the ID opens in a new tab', async () => {
    routes();
    (apiFetchBlob as jest.Mock).mockResolvedValue({ blob: new Blob(['x'], { type: 'image/png' }), filename: 'id.png' });
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: jest.fn() });
    wrap(<YxVisitorLogPage />);
    await ue.click(await screen.findByRole('button', { name: 'Photo of ID' }));
    await waitFor(() => expect(apiFetchBlob).toHaveBeenCalledWith('/visitors/v1/id-image', {}, 't'));
    expect(open).toHaveBeenCalledWith('blob:x', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('pass page: the ID type and last 4 go with the acceptance', async () => {
    (useParams as jest.Mock).mockReturnValue({ token: 'a'.repeat(32) });
    const page = { state: 'details', visitor: 'Rahul Menon', mobile: '+91 ••••• ••871', company: 'Nilgiri', purpose: 'meeting', host: 'Divya', location: 'Chennai office', address: 'Guindy', window: { from: '2026-11-12T08:30:00.000Z', to: '2026-11-12T09:30:00.000Z' }, vehicle: null, hours: '09:00 to 18:30', retentionDays: 90, notice: 'Wear your badge.', noticeVersion: 'v-1', passCode: null, idStep: true, idGiven: null, idRetentionDays: 30 };
    (publicGet as jest.Mock).mockResolvedValue(page);
    (publicPost as jest.Mock).mockResolvedValue({ ...page, state: 'pass', passCode: 'V-7KQ2-MX4P' });
    wrap(<YxVisitPassPage />);
    await ue.click(await screen.findByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('combobox', { name: /ID type/ }));
    await ue.click(screen.getByRole('option', { name: 'PAN card' }));
    await ue.type(screen.getByLabelText(/Last 4 characters/), '123f');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('checkbox', { name: /visitor notice and the privacy notice/ }));
    await ue.click(screen.getByRole('button', { name: 'Get my pass' }));
    await waitFor(() => expect(publicPost).toHaveBeenCalledWith(`/visits/${'a'.repeat(32)}/accept`, { noticeVersion: 'v-1', idType: 'pan', idLast4: '123F' }));
  });
});
