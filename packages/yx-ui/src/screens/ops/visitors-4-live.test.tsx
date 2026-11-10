import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PreRegisterScreen, VisitorDeskScreen, VisitorLogScreen, type LiveVisitorDesk } from './visitors';
import { ROLLCALL_SAMPLE, RollCallScreen, type LiveRollCall } from './visitor-rollcall';
import type { VisitView } from './visitors-data';

// Visitors slice 4 (answers 607, 608, 612, 617): the badge, reports from counts, the roll-call. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TODAY = new Date(2026, 10, 12);
const v = (over: Partial<VisitView> = {}): VisitView => ({
  id: 'v1', name: 'Rahul Menon', mobile: '+919840122871', email: 'rahul@x.test', company: 'Nilgiri Pharma Ltd', purpose: 'meeting', host: 'Divya', location: 'Chennai office', locationId: 'maa',
  startsAt: '2026-11-12T08:30:00.000Z', endsAt: '2026-11-12T09:30:00.000Z', status: 'expected', statusText: 'Expected', passCode: 'V-7KQ2-MX4P', badge: null, vehicle: null, noticeAcceptedAt: '2026-11-12T03:00:00Z', checkedInAt: null, checkedOutAt: null, ...over,
});
const onSite = v({ id: 'v2', name: 'Asha Kurian', status: 'on_site', statusText: 'On site', badge: 'V-0412', checkedInAt: '2026-11-12T08:00:00Z' });
const desk = (over: Partial<LiveVisitorDesk> = {}): LiveVisitorDesk => ({
  state: 'ready', onRetry: vi.fn(), locations: [{ value: 'maa', label: 'Chennai office' }], locationId: 'maa', onLocation: vi.fn(), today: TODAY,
  visits: [v(), onSite], canChange: true, onFind: vi.fn(async () => v()), onCheckIn: vi.fn(async () => v({ status: 'on_site', statusText: 'On site', badge: 'V-0413' })), onCheckOut: vi.fn(async () => undefined),
  idCapture: 'off', onIdImage: vi.fn(), badge: 'name_qr', onPrintBadge: vi.fn(async () => undefined), onOpenRollCall: vi.fn(), ...over,
});

describe('VIS-01 badge and roll-call (live)', () => {
  it('check in prints the badge; a visitor on site can have it printed again', async () => {
    const live = desk();
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    await ue.click(within(screen.getByRole('dialog', { name: /Check in/ })).getByRole('button', { name: 'Check in and print badge' }));
    await waitFor(() => expect(live.onPrintBadge).toHaveBeenCalledWith('v1'));
    await ue.click(screen.getByRole('tab', { name: /On site now/ }));
    await ue.click(screen.getByRole('button', { name: 'Print badge' }));
    await waitFor(() => expect(live.onPrintBadge).toHaveBeenCalledWith('v2'));
  });

  it('a badge that does not print says so; the visitor stays checked in', async () => {
    const live = desk({ onPrintBadge: vi.fn(async () => { throw new Error('popup blocked'); }) });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    await ue.click(within(screen.getByRole('dialog', { name: /Check in/ })).getByRole('button', { name: 'Check in and print badge' }));
    expect(await screen.findByText('Badge not printed')).toBeInTheDocument();
    expect(live.onCheckIn).toHaveBeenCalled();
  });

  it('pass on the phone only: no badge printed, no print buttons', async () => {
    const live = desk({ badge: 'phone_only' });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    const d = screen.getByRole('dialog', { name: /Check in/ });
    expect(within(d).getByText(/QR pass on their phone/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(live.onCheckIn).toHaveBeenCalled());
    expect(live.onPrintBadge).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Print badge' })).not.toBeInTheDocument();
  });

  it('the Roll-call button opens the roll-call', async () => {
    const live = desk();
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Roll-call' }));
    expect(live.onOpenRollCall).toHaveBeenCalled();
  });
});

describe('VIS-04 reports (live, counts only)', () => {
  const base = { state: 'ready' as const, onRetry: vi.fn(), locations: [{ value: 'maa', label: 'Chennai office' }], onExport: vi.fn(), onOpenIdImage: vi.fn(), visits: [] };
  it('the Reports tab shows the counts with no names', async () => {
    show(<VisitorLogScreen log={[]} today={TODAY} live={{ ...base, reports: { state: 'ready', onRetry: vi.fn(), data: { from: '2025-11-01', to: '2026-11-12', total: 7, byLocation: [{ label: 'Chennai office', visits: 7 }], byPurpose: [{ label: 'Meeting', visits: 5 }, { label: 'Audit', visits: 2 }], byMonth: [{ month: '2026-10', visits: 3 }, { month: '2026-11', visits: 4 }] } } }} />);
    await ue.click(screen.getByRole('tab', { name: 'Reports' }));
    expect(screen.getByText(/7 visits/)).toBeInTheDocument();
    expect(screen.getByText(/Counts only: no visitor names/)).toBeInTheDocument();
    expect(screen.getByText('Visits by month')).toBeInTheDocument();
  });
  it('reports that fail to load offer a retry; without reports there is no tab', async () => {
    const onRetry = vi.fn();
    const { unmount } = show(<VisitorLogScreen log={[]} today={TODAY} live={{ ...base, reports: { state: 'error', onRetry, data: null } }} />);
    await ue.click(screen.getByRole('tab', { name: 'Reports' }));
    await ue.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    unmount();
    show(<VisitorLogScreen log={[]} today={TODAY} live={base} />);
    expect(screen.queryByRole('tab', { name: 'Reports' })).not.toBeInTheDocument();
  });
});

describe('VIS-06 roll-call (live)', () => {
  const live = (over: Partial<LiveRollCall> = {}): LiveRollCall => ({ state: 'ready', onRetry: vi.fn(), data: ROLLCALL_SAMPLE, onLocation: vi.fn(), onPrint: vi.fn(async () => undefined), ...over });
  it('visitors and employees together; print and change location', async () => {
    const l = live();
    show(<RollCallScreen data={ROLLCALL_SAMPLE} live={l} />);
    expect(screen.getByText('Suresh Babu')).toBeInTheDocument();
    expect(screen.getByText('KF-0142')).toBeInTheDocument();
    expect(screen.getByText(/2 visitors · 3 employees/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Print roll-call' }));
    expect(l.onPrint).toHaveBeenCalled();
  });
  it('a print that fails shows why; an empty site says so', async () => {
    show(<RollCallScreen data={ROLLCALL_SAMPLE} live={live({ onPrint: vi.fn(async () => { throw new Error('The roll-call is for reception, security and HR at this location.'); }), data: { ...ROLLCALL_SAMPLE, visitors: [], employees: [] } })} />);
    expect(screen.getByText('No visitors on site.')).toBeInTheDocument();
    expect(screen.getByText('No employees checked in here today.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Print roll-call' }));
    expect(await screen.findByText('The roll-call is for reception, security and HR at this location.')).toBeInTheDocument();
  });
});

describe('VIS-02 invite outside the allowed hours (652)', () => {
  const pre = (outsideHours: string | null) => ({ state: 'ready' as const, onRetry: vi.fn(), visits: [], locations: [{ value: 'maa', label: 'Chennai office' }], today: TODAY, canChange: true, onInvite: vi.fn(async () => ({ ...v(), emailed: true, outsideHours })), onCancel: vi.fn() });
  const send = async () => {
    await ue.click(screen.getByRole('button', { name: 'Invite a visitor' }));
    await ue.type(screen.getByLabelText(/^Visitor name/), 'Rahul Menon');
    await ue.type(screen.getByLabelText(/^Mobile/), '98401 22871');
    await ue.type(screen.getByLabelText(/^Email/), 'rahul@x.test');
    await ue.type(screen.getByLabelText(/^Date/), '20/11/2026');
    await ue.type(screen.getByLabelText(/^Arrives/), '8:00 pm');
    await ue.type(screen.getByLabelText(/^Leaves by/), '9:00 pm');
    await ue.click(screen.getByRole('button', { name: 'Send invite' }));
  };
  it('outside the hours: sent, with a warning in the toast', async () => {
    show(<PreRegisterScreen visits={[]} today={TODAY} live={pre('09:00 to 18:30')} />);
    await send();
    expect(await screen.findByText(/outside the allowed hours \(09:00 to 18:30\)/)).toBeInTheDocument();
  });
  it('inside the hours: no warning', async () => {
    show(<PreRegisterScreen visits={[]} today={TODAY} live={pre(null)} />);
    await send();
    expect(await screen.findByText('Invite sent')).toBeInTheDocument();
    expect(screen.queryByText(/outside the allowed hours/)).not.toBeInTheDocument();
  });
});
