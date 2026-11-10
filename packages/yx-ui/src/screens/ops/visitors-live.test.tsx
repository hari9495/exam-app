import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PreRegisterScreen, VisitorDeskScreen, VisitorLogScreen } from './visitors';
import type { VisitView } from './visitors-data';
import { VisitorInviteScreen, type PublicVisitView } from '../portals/t9-business';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { visitorSettingsChanges, visitorSettingsPage, type VisitorSettingsData } from '../settings/visitors-live';
import { VISIT } from '../portals/t9-biz-data';

// Visitors slice 1 (M02 §B11): the drawn VIS-01, VIS-02, VIS-04, T9-14 and Settings 3.12 with `live`. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TODAY = new Date(2026, 10, 12);
const v = (over: Partial<VisitView> = {}): VisitView => ({
  id: 'v1', name: 'Rahul Menon', mobile: '+919840122871', email: 'rahul@x.test', company: 'Nilgiri Pharma Ltd', purpose: 'meeting', host: 'Divya', location: 'Chennai office', locationId: 'maa',
  startsAt: '2026-11-12T08:30:00.000Z', endsAt: '2026-11-12T09:30:00.000Z', status: 'expected', statusText: 'Expected', passCode: 'V-7KQ2-MX4P', badge: null, vehicle: null, noticeAcceptedAt: null, checkedInAt: null, checkedOutAt: null, ...over,
});
const desk = (over = {}) => ({
  state: 'ready' as const, onRetry: vi.fn(), locations: [{ value: 'maa', label: 'Chennai office' }, { value: 'hsr', label: 'Hosur plant' }], locationId: 'maa', onLocation: vi.fn(), today: TODAY,
  visits: [v(), v({ id: 'v2', name: 'Asha Kurian', status: 'on_site', statusText: 'On site', badge: 'V-0412', noticeAcceptedAt: '2026-11-12T03:00:00Z', checkedInAt: '2026-11-12T08:00:00Z' })],
  canChange: true,
  onFind: vi.fn(async () => v()),
  onCheckIn: vi.fn(async () => v({ status: 'on_site', statusText: 'On site', badge: 'V-0413' })),
  onCheckOut: vi.fn(async () => undefined),
  ...over,
});

describe('VIS-01 desk (live)', () => {
  it('check in: the notice must be ticked when the visitor did not accept it on the link; then checked in with a toast', async () => {
    const live = desk();
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    expect(screen.getByText('Chennai office reception. Scan the visitor\'s QR pass or check them in by name.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add walk-in' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    const drawer = screen.getByRole('dialog', { name: /Check in Rahul Menon/ });
    expect(within(drawer).getByText('V-7KQ2-MX4P')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    expect(live.onCheckIn).not.toHaveBeenCalled();
    expect(await within(drawer).findByText('Tick that the visitor read and accepted the notice.')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('checkbox', { name: /read and accepted the notice/ }));
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(live.onCheckIn).toHaveBeenCalledWith('v1', true));
    expect((await screen.findAllByText('Rahul Menon checked in')).length).toBeGreaterThan(0);
  });

  it('accepted on the link: no tick asked; a refusal stays in the drawer; check out; the location switch', async () => {
    const live = desk({ visits: [v({ noticeAcceptedAt: '2026-11-12T03:00:00Z' }), v({ id: 'v2', name: 'Asha Kurian', status: 'on_site', statusText: 'On site', badge: 'V-0412' })], onCheckIn: vi.fn(async () => { throw new Error('This pass has expired. The host can invite them again.'); }) });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    const drawer = screen.getByRole('dialog', { name: /Check in Rahul Menon/ });
    expect(within(drawer).getByText('Notice accepted')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(live.onCheckIn).toHaveBeenCalledWith('v1', false));
    expect(await within(drawer).findByText(/This pass has expired/)).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Cancel' }));
    await ue.click(screen.getByRole('tab', { name: /On site now/ }));
    await ue.click(screen.getByRole('button', { name: 'Check out' }));
    await waitFor(() => expect(live.onCheckOut).toHaveBeenCalledWith('v2'));
    await ue.click(screen.getByRole('combobox', { name: 'Location' }));
    await ue.click(await screen.findByRole('option', { name: 'Hosur plant' }));
    expect(live.onLocation).toHaveBeenCalledWith('hsr');
  });

  it('Scan QR pass: a found expected pass opens the check-in; an unknown code says so; acting for someone else sees the list only', async () => {
    const live = desk({ onFind: vi.fn(async (code: string) => { if (code === 'V-AAAA-AAAA') throw new Error('No visit has that pass code.'); return v(); }) });
    const { unmount } = show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Scan QR pass' }));
    await ue.type(screen.getByLabelText('Pass code'), 'V-AAAA-AAAA');
    await ue.click(screen.getByRole('button', { name: 'Find visitor' }));
    expect(await screen.findByText('No visit has that pass code.')).toBeInTheDocument();
    await ue.clear(screen.getByLabelText('Pass code'));
    await ue.type(screen.getByLabelText('Pass code'), 'v-7kq2-mx4p');
    await ue.click(screen.getByRole('button', { name: 'Find visitor' }));
    expect(await screen.findByRole('dialog', { name: /Check in Rahul Menon/ })).toBeInTheDocument();
    unmount();
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={desk({ canChange: false })} />);
    expect(screen.queryByRole('button', { name: 'Check in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scan QR pass' })).not.toBeInTheDocument();
  });
});

describe('VIS-02 my visitors (live)', () => {
  const pre = (over = {}) => ({ state: 'ready' as const, onRetry: vi.fn(), visits: [v()], locations: [{ value: 'maa', label: 'Chennai office' }], today: TODAY, canChange: true, onInvite: vi.fn(async () => ({ ...v(), emailed: true })), onCancel: vi.fn(async () => undefined), ...over });

  it('pressed too early, Send invite names what is missing and sends nothing; filled in, it sends the invite', async () => {
    const live = pre();
    show(<PreRegisterScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Invite a visitor' }));
    await ue.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByText("Enter the visitor's name.")).toBeInTheDocument();
    expect(screen.getByText('Enter an email like name@example.com: the pass goes there.')).toBeInTheDocument();
    expect(live.onInvite).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/^Visitor name/), 'Anjali Varma');
    await ue.type(screen.getByLabelText(/^Mobile/), '98401 22871');
    await ue.type(screen.getByLabelText(/^Email/), 'anjali@x.test');
    await ue.type(screen.getByLabelText(/^Date/), '20/11/2026');
    await ue.type(screen.getByLabelText(/^Arrives/), '2:00 pm');
    await ue.type(screen.getByLabelText(/^Leaves by/), '3:00 pm');
    await ue.click(screen.getByRole('button', { name: 'Send invite' }));
    await waitFor(() => expect(live.onInvite).toHaveBeenCalledWith(expect.objectContaining({ name: 'Anjali Varma', mobile: '98401 22871', email: 'anjali@x.test', locationId: 'maa', purpose: 'meeting', day: '2026-11-20', from: '14:00', to: '15:00' })));
    expect((await screen.findAllByText('Invite sent')).length).toBeGreaterThan(0);
  });

  it('cancels an expected visit; acting for someone else cannot invite or cancel', async () => {
    const live = pre();
    const { unmount } = show(<PreRegisterScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Cancel visit' }));
    await waitFor(() => expect(live.onCancel).toHaveBeenCalledWith('v1'));
    unmount();
    show(<PreRegisterScreen visits={[]} today={TODAY} live={pre({ canChange: false })} />);
    expect(screen.queryByRole('button', { name: 'Invite a visitor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel visit' })).not.toBeInTheDocument();
  });
});

describe('VIS-04 log (live)', () => {
  it('rows with the days left before deletion; export; no Reports tab until slice 4', async () => {
    const onExport = vi.fn(async () => undefined);
    show(<VisitorLogScreen log={[]} today={TODAY} live={{ state: 'ready', onRetry: vi.fn(), locations: [{ value: 'maa', label: 'Chennai office' }], onExport, visits: [v({ status: 'checked_out', statusText: 'Checked out', checkedInAt: '2026-11-12T08:31:00Z', checkedOutAt: '2026-11-12T09:10:00Z', noticeAcceptedAt: '2026-11-12T03:00:00Z', deletedOn: '2026-11-22' }), v({ id: 'v9', name: 'Old visitor', status: 'not_out', statusText: 'Not checked out', checkedInAt: '2026-11-12T08:31:00Z', deletedOn: '2026-11-12' })] }} />);
    expect(screen.getByText('10 days')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getAllByText('Not checked out').length).toBeGreaterThan(0);
    expect(screen.queryByRole('tab', { name: 'Reports' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Export for audit' }));
    expect(onExport).toHaveBeenCalled();
  });
});

describe('T9-14 the visitor’s pass page (live)', () => {
  const pv = (over: Partial<PublicVisitView> = {}): PublicVisitView => ({
    state: 'details', visitor: 'Rahul Menon', mobile: '+91 ••••• ••871', company: 'Nilgiri Pharma Ltd', purpose: 'meeting', host: 'Divya', location: 'Chennai office', address: '7 SIDCO Estate, Chennai', window: { from: '2026-11-12T08:30:00.000Z', to: '2026-11-12T09:30:00.000Z' },
    vehicle: null, hours: '09:00 to 18:30', retentionDays: 90, notice: 'Wear your badge. Stay with your host.', noticeVersion: 'v-abc', passCode: null, brand: { orgName: 'Kaveri Foods', whiteLabel: false }, ...over,
  });
  it('details, then the notice (ticked), then the pass; the vehicle goes with it', async () => {
    const onAccept = vi.fn(async () => undefined);
    show(<VisitorInviteScreen tenant="" visit={VISIT} stage="details" today={TODAY} live={{ state: 'ready', onRetry: vi.fn(), visit: pv(), onAccept }} />);
    expect(screen.getByText('+91 ••••• ••871')).toBeInTheDocument();
    expect(screen.queryByText('ID')).not.toBeInTheDocument();
    await ue.type(screen.getByLabelText(/Vehicle number/), 'TN 09 BX 4471');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Wear your badge. Stay with your host.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Get my pass' }));
    expect(onAccept).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('checkbox', { name: /visitor notice and the privacy notice/ }));
    await ue.click(screen.getByRole('button', { name: 'Get my pass' }));
    await waitFor(() => expect(onAccept).toHaveBeenCalledWith('TN 09 BX 4471'));
  });
  it('a used, cancelled or unknown link says so', () => {
    const { unmount } = show(<VisitorInviteScreen tenant="" visit={VISIT} stage="details" today={TODAY} live={{ state: 'ready', onRetry: vi.fn(), visit: pv({ state: 'blocked' }), onAccept: vi.fn() }} />);
    expect(screen.getByText("We can't issue a pass for this visit")).toBeInTheDocument();
    unmount();
    const second = show(<VisitorInviteScreen tenant="" visit={VISIT} stage="details" today={TODAY} live={{ state: 'ready', onRetry: vi.fn(), visit: pv({ state: 'expired' }), onAccept: vi.fn() }} />);
    expect(screen.getByText('This visit pass has expired')).toBeInTheDocument();
    second.unmount();
    show(<VisitorInviteScreen tenant="" visit={VISIT} stage="details" today={TODAY} live={{ state: 'not-found', onRetry: vi.fn(), visit: null, onAccept: vi.fn() }} />);
    expect(screen.getByText('We could not find this visit.')).toBeInTheDocument();
  });
});

describe('Settings 3.12 (live)', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.12')!;
  const data: VisitorSettingsData = {
    canEdit: true,
    values: { 'visitors.host_timeout_minutes': '10', 'visitors.id_capture': 'off', 'visitors.photo': 'on', 'visitors.hours_from': '09:00', 'visitors.hours_to': '18:30', 'visitors.notice': 'Wear your badge.', 'visitors.badge': 'name_qr', 'visitors.retention_days': '90', 'visitors.id_retention_days': '30' },
    defaults: { 'visitors.host_timeout_minutes': '10', 'visitors.retention_days': '90', 'visitors.badge': 'name_qr', 'visitors.photo': 'on', 'visitors.id_capture': 'off' },
    choices: { 'visitors.retention_days': ['30', '90', '730'], 'visitors.host_timeout_minutes': ['5', '10'], 'visitors.badge': ['name_qr', 'phone_only'], 'visitors.hours_from': ['09:00', '09:30'], 'visitors.hours_to': ['18:00', '18:30'], 'visitors.id_retention_days': ['30'] },
    labels: { 'visitors.badge': { name_qr: 'Name badge with QR', phone_only: 'Pass on the phone only' } },
    overrides: { 'visitors.retention_days': ['Hosur plant'] },
    lastChange: null,
  };
  it('the company values on the drawn fields; a location’s own value named; types and the blocked list left out', () => {
    const page = visitorSettingsPage(design, data);
    const f = (k: string) => page.sections.flatMap((s) => s.settings).find((d) => d.key === k);
    expect(f('vis.retention_days')).toMatchObject({ kind: 'select', value: '90', scope: 'Company · own value at Hosur plant', optionLabels: expect.objectContaining({ '730': '730 days' }) });
    expect(f('vis.photo')).toMatchObject({ value: true });
    expect(f('vis.id_capture')).toMatchObject({ value: false });
    expect(f('vis.badge')).toMatchObject({ value: 'name_qr', optionLabels: { name_qr: 'Name badge with QR', phone_only: 'Pass on the phone only' } });
    expect(f('vis.types')).toBeUndefined();
    expect(f('vis.watchlist_access')).toBeUndefined();
  });
  it('changes map to the company settings; unknown fields are ignored', () => {
    expect(visitorSettingsChanges({ 'vis.photo': false, 'vis.retention_days': '30', 'vis.types': 'x' })).toEqual([
      { key: 'visitors.photo', value: 'off' },
      { key: 'visitors.retention_days', value: '30' },
    ]);
  });
});
