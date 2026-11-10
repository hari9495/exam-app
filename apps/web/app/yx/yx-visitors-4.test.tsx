import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, apiFetchBlob } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxVisitorDeskPage from './(app)/visitors/page';
import YxVisitorLogPage from './(app)/visitors/log/page';
import YxVisitorRollCallPage from './(app)/visitors/rollcall/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ API_BASE: 'http://api', apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Visitors slice 4 (607, 608, 612): the badge PDF from the desk, reports in the log, the roll-call page.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const blob = apiFetchBlob as jest.Mock;
const visit = (over = {}) => ({ id: 'v2', name: 'Asha Kurian', mobile: '+919840122871', email: 'a@x.test', company: null, purpose: 'meeting', host: 'Divya', location: 'Chennai office', locationId: 'maa', startsAt: '2026-11-12T08:30:00.000Z', endsAt: '2026-11-12T09:30:00.000Z', status: 'on_site', statusText: 'On site', passCode: 'V-7KQ2-MX4P', badge: 'V-0412', vehicle: null, noticeAcceptedAt: '2026-11-12T03:00:00Z', checkedInAt: '2026-11-12T08:31:00Z', checkedOutAt: null, ...over });
const OPTIONS = { locations: [{ value: 'maa', label: 'Chennai office' }], desk: [{ value: 'maa', label: 'Chennai office' }], log: [{ value: 'maa', label: 'Chennai office' }], canSettings: false, acting: false };
const ROLL = { location: { id: 'maa', name: 'Chennai office' }, locations: [{ value: 'maa', label: 'Chennai office' }], at: '2026-11-12T09:00:00Z', visitors: [{ id: 'v2', name: 'Asha Kurian', company: null, host: 'Divya', badge: 'V-0412', inAt: '2026-11-12T08:31:00Z', minorAdult: null }], employees: [{ id: 'e1', name: 'Neha Joshi', code: 'KF-0031', inAt: '2026-11-12T03:41:00Z' }] };
const push = jest.fn();
const open = jest.spyOn(window, 'open');

beforeEach(() => {
  api.mockReset();
  blob.mockReset().mockResolvedValue({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), filename: 'x.pdf' });
  push.mockReset();
  open.mockReset().mockReturnValue({} as Window);
  Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  api.mockImplementation(async (path: string) => {
    const map: Record<string, unknown> = {
      '/visitors/options': OPTIONS,
      '/visitors/desk?locationId=maa': { location: { id: 'maa', name: 'Chennai office' }, today: '2026-11-12', canChange: true, idCapture: 'off', badge: 'name_qr', visits: [visit()] },
      '/visitors/log': { locations: OPTIONS.log, visits: [] },
      '/visitors/reports': { from: '2025-11-01', to: '2026-11-12', total: 12, byLocation: [{ label: 'Chennai office', visits: 12 }], byPurpose: [{ label: 'Meeting', visits: 12 }], byMonth: [{ month: '2026-11', visits: 12 }] },
      '/visitors/rollcall': ROLL,
    };
    if (path in map) return map[path];
    throw Object.assign(new Error(`unexpected ${path}`), { status: 404 });
  });
});

describe('Visitors slice 4 pages (live)', () => {
  it('desk: Print badge opens the badge PDF; Roll-call goes to the roll-call of this location', async () => {
    wrap(<YxVisitorDeskPage />);
    await ue.click(await screen.findByRole('tab', { name: /On site now/ }));
    await ue.click(screen.getByRole('button', { name: 'Print badge' }));
    await waitFor(() => expect(blob).toHaveBeenCalledWith('/visitors/v2/badge.pdf', {}, 't'));
    expect(open).toHaveBeenCalledWith('blob:x', '_blank');
    await ue.click(screen.getByRole('button', { name: 'Roll-call' }));
    expect(push).toHaveBeenCalledWith('/yx/visitors/rollcall?locationId=maa');
  });

  it('desk: a blocked pop-up says the badge did not print', async () => {
    open.mockReturnValue(null);
    wrap(<YxVisitorDeskPage />);
    await ue.click(await screen.findByRole('tab', { name: /On site now/ }));
    await ue.click(screen.getByRole('button', { name: 'Print badge' }));
    expect(await screen.findByText('Badge not printed')).toBeInTheDocument();
  });

  it('log: the Reports tab reads the counts', async () => {
    wrap(<YxVisitorLogPage />);
    await ue.click(await screen.findByRole('tab', { name: 'Reports' }));
    expect(await screen.findByText(/12 visits/)).toBeInTheDocument();
  });

  it('roll-call: visitors and employees; Print roll-call opens the PDF for the location', async () => {
    wrap(<YxVisitorRollCallPage />);
    expect(await screen.findByText('Neha Joshi')).toBeInTheDocument();
    expect(screen.getByText('Asha Kurian')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Print roll-call' }));
    await waitFor(() => expect(blob).toHaveBeenCalledWith('/visitors/rollcall.pdf?locationId=maa', {}, 't'));
  });

  it('roll-call: without the key the page says no access', async () => {
    api.mockImplementation(async () => {
      throw Object.assign(new Error('forbidden'), { status: 403 });
    });
    wrap(<YxVisitorRollCallPage />);
    expect(await screen.findByText(/Reception, Security, HR admin or Facility admin role/)).toBeInTheDocument();
  });
});
