import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PreRegisterScreen, VisitorDeskScreen, VisitorLogScreen, type LiveVisitorDesk } from './visitors';
import { VisitorWatchListScreen, type LiveWatchList } from './visitor-watchlist';
import type { VisitView } from './visitors-data';
import { VisitorInviteScreen, type PublicVisitView } from '../portals/t9-business';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { visitorSettingsPage, visitorSettingsChanges } from '../settings/visitors-live';
import { VISIT } from '../portals/t9-biz-data';

// Visitors slice 3 (answers 603, 605, 614): the watch-list, ID proof and visitors under 18 on the drawn screens. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TODAY = new Date(2026, 10, 12);
const v = (over: Partial<VisitView> = {}): VisitView => ({
  id: 'v1', name: 'Rahul Menon', mobile: '+919840122871', email: 'rahul@x.test', company: 'Nilgiri Pharma Ltd', purpose: 'meeting', host: 'Divya', location: 'Chennai office', locationId: 'maa',
  startsAt: '2026-11-12T08:30:00.000Z', endsAt: '2026-11-12T09:30:00.000Z', status: 'expected', statusText: 'Expected', passCode: 'V-7KQ2-MX4P', badge: null, vehicle: null, noticeAcceptedAt: '2026-11-12T03:00:00Z', checkedInAt: null, checkedOutAt: null, ...over,
});
const desk = (over: Partial<LiveVisitorDesk> = {}): LiveVisitorDesk => ({
  state: 'ready', onRetry: vi.fn(), locations: [{ value: 'maa', label: 'Chennai office' }], locationId: 'maa', onLocation: vi.fn(), today: TODAY,
  visits: [v()], canChange: true, onFind: vi.fn(async () => v()), onCheckIn: vi.fn(async () => v({ status: 'on_site', statusText: 'On site', badge: 'V-0413' })), onCheckOut: vi.fn(async () => undefined),
  idCapture: 'on', onIdImage: vi.fn(async () => undefined), ...over,
});
const openCheckIn = async () => {
  await ue.click(screen.getByRole('button', { name: 'Check in' }));
  return screen.getByRole('dialog', { name: /Check in/ });
};

describe('VIS-01 desk: watch-list, ID and under 18 (live)', () => {
  it('a blocked visit: stop at reception without any reason, and no check-in button', () => {
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={desk({ visits: [v({ id: 'b1', name: 'Manish Gupta', status: 'blocked', statusText: 'Blocked' })] })} />);
    const alert = screen.getByText(/Manish Gupta can't go ahead today/);
    expect(alert).toBeInTheDocument();
    expect(screen.queryByText(/watch-list|blocked-visitor list/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check in' })).not.toBeInTheDocument();
  });

  it('a scanned pass that is blocked stops at reception instead of opening the check-in', async () => {
    const live = desk({ onFind: vi.fn(async () => v({ name: 'Manish Gupta', status: 'blocked', statusText: 'Blocked' })) });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Scan QR pass' }));
    await ue.type(screen.getByLabelText('Pass code'), 'V-7KQ2-MX4P');
    await ue.click(screen.getByRole('button', { name: 'Find visitor' }));
    expect(await screen.findByText(/Manish Gupta can't go ahead today/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Check in/ })).not.toBeInTheDocument();
  });

  it('ID type and last 4 are required where the location takes ID; never more than 4 characters', async () => {
    const live = desk();
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    const drawer = await openCheckIn();
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    expect(live.onCheckIn).not.toHaveBeenCalled();
    expect(within(drawer).getAllByText('Choose the ID the visitor showed.').length).toBeGreaterThan(0);
    await ue.type(within(drawer).getByLabelText(/Last 4 characters/), '12345678');
    expect(within(drawer).getByLabelText(/Last 4 characters/)).toHaveValue('1234');
    await ue.click(within(drawer).getByRole('combobox', { name: /ID shown/ }));
    await ue.click(screen.getByRole('option', { name: 'Passport' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(live.onCheckIn).toHaveBeenCalledWith('v1', { noticeAccepted: false, idType: 'passport', idLast4: '1234' }));
  });

  it('where the location keeps a photo of the ID it is required, but never of an Aadhaar card', async () => {
    const live = desk({ idCapture: 'with_image' });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    const drawer = await openCheckIn();
    await ue.click(within(drawer).getByRole('combobox', { name: /ID shown/ }));
    await ue.click(screen.getByRole('option', { name: 'Passport' }));
    await ue.type(within(drawer).getByLabelText(/Last 4 characters/), 'z123');
    expect(within(drawer).getByText('Photo of the ID')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    expect(live.onCheckIn).not.toHaveBeenCalled();
    expect(within(drawer).getAllByText('Add a photo of the ID: this location keeps one.').length).toBeGreaterThan(0);
    await ue.click(within(drawer).getByRole('combobox', { name: /ID shown/ }));
    await ue.click(screen.getByRole('option', { name: 'Aadhaar' }));
    expect(within(drawer).queryByText('Photo of the ID')).not.toBeInTheDocument();
    expect(within(drawer).getByText(/No photo of an Aadhaar card/)).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(live.onCheckIn).toHaveBeenCalledWith('v1', { noticeAccepted: false, idType: 'aadhaar', idLast4: 'Z123' }));
  });

  it('the photo of the ID goes up with its type and last 4', async () => {
    const live = desk({ idCapture: 'with_image' });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    const drawer = await openCheckIn();
    await ue.click(within(drawer).getByRole('combobox', { name: /ID shown/ }));
    await ue.click(screen.getByRole('option', { name: 'Driving licence' }));
    await ue.type(within(drawer).getByLabelText(/Last 4 characters/), '4417');
    const input = drawer.querySelector('input[type="file"]') as HTMLInputElement;
    await ue.upload(input, new File(['x'], 'id.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(live.onIdImage).toHaveBeenCalledWith('v1', expect.any(File), 'driving_licence', '4417'));
  });

  it('a visitor under 18: the adult must be there; no ID asked even where the location takes ID', async () => {
    const live = desk({ visits: [v({ minor: true, minorAdult: 'Lakshmi Rao' })] });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    const drawer = await openCheckIn();
    expect(within(drawer).getByText(/Comes with Lakshmi Rao/)).toBeInTheDocument();
    expect(within(drawer).queryByLabelText(/Last 4 characters/)).not.toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    expect(live.onCheckIn).not.toHaveBeenCalled();
    await ue.click(within(drawer).getByLabelText('Lakshmi Rao is here with them'));
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(live.onCheckIn).toHaveBeenCalledWith('v1', { noticeAccepted: false, adultPresent: true }));
  });

  it('an ID already given on the link is shown, not asked again', async () => {
    const live = desk({ visits: [v({ idType: 'pan', idText: 'PAN card ··123F' })] });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    const drawer = await openCheckIn();
    expect(within(drawer).getByText('PAN card ··123F')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(live.onCheckIn).toHaveBeenCalledWith('v1', { noticeAccepted: false }));
  });
});

describe('VIS-02 invite: under 18 and blocked (live)', () => {
  const live = (over = {}) => ({
    state: 'ready' as const, onRetry: vi.fn(), visits: [], locations: [{ value: 'maa', label: 'Chennai office' }], today: TODAY, canChange: true,
    onInvite: vi.fn(async () => ({ ...v(), emailed: true })), onCancel: vi.fn(), ...over,
  });
  const fill = async () => {
    await ue.click(screen.getByRole('button', { name: 'Invite a visitor' }));
    const d = screen.getByRole('dialog', { name: 'Invite a visitor' });
    await ue.type(within(d).getByLabelText(/Visitor name/), 'Aarav Menon');
    await ue.type(within(d).getByLabelText(/^Mobile/), '9840122872');
    await ue.type(within(d).getByLabelText(/^Email/), 'aarav@x.test');
    await ue.type(within(d).getByLabelText(/^Date/), '20/11/2026');
    await ue.type(within(d).getByLabelText(/^Arrives/), '2:00 pm');
    await ue.type(within(d).getByLabelText(/^Leaves by/), '3:00 pm');
    return d;
  };

  it('under 18 needs the named adult; then the invite carries both', async () => {
    const l = live();
    show(<PreRegisterScreen visits={[]} today={TODAY} live={l} />);
    const d = await fill();
    await ue.click(within(d).getByLabelText('The visitor is under 18'));
    await ue.click(within(d).getByRole('button', { name: 'Send invite' }));
    expect(l.onInvite).not.toHaveBeenCalled();
    expect(within(d).getAllByText('Name the adult who comes with them.').length).toBeGreaterThan(0);
    await ue.type(within(d).getByLabelText(/Adult who comes with them/), 'Rahul Menon');
    await ue.click(within(d).getByRole('button', { name: 'Send invite' }));
    await waitFor(() => expect(l.onInvite).toHaveBeenCalledWith(expect.objectContaining({ minor: true, minorAdult: 'Rahul Menon' })));
  });

  it('a blocked invite tells the host only that it cannot go ahead', async () => {
    const l = live({ onInvite: vi.fn(async () => ({ ...v({ status: 'blocked', statusText: 'Blocked' }), emailed: false })) });
    show(<PreRegisterScreen visits={[]} today={TODAY} live={l} />);
    const d = await fill();
    await ue.click(within(d).getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByText("This visit can't go ahead")).toBeInTheDocument();
    expect(screen.queryByText(/watch-list/i)).not.toBeInTheDocument();
  });
});

describe('T9-14 the ID step (live)', () => {
  const pv = (over: Partial<PublicVisitView> = {}): PublicVisitView => ({
    state: 'details', visitor: 'Rahul Menon', mobile: '+91 ••••• ••871', company: 'Nilgiri', purpose: 'meeting', host: 'Divya', location: 'Chennai office', address: 'Guindy', window: { from: '2026-11-12T08:30:00.000Z', to: '2026-11-12T09:30:00.000Z' },
    vehicle: null, hours: '09:00 to 18:30', retentionDays: 90, notice: 'Wear your badge.', noticeVersion: 'v-1', passCode: null, idStep: true, idGiven: null, idRetentionDays: 30, ...over,
  });

  it('where the location takes ID: type and last 4 before the notice; sent with the acceptance', async () => {
    const onAccept = vi.fn(async () => undefined);
    show(<VisitorInviteScreen tenant="" visit={VISIT} stage="details" today={TODAY} live={{ state: 'ready', onRetry: vi.fn(), visit: pv(), onAccept }} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/delete them after 30 days/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByRole('checkbox', { name: /visitor notice and the privacy notice/ })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: /ID type/ }));
    await ue.click(screen.getByRole('option', { name: 'Voter ID' }));
    await ue.type(screen.getByLabelText(/Last 4 characters/), 'ab12');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('checkbox', { name: /visitor notice and the privacy notice/ }));
    await ue.click(screen.getByRole('button', { name: 'Get my pass' }));
    await waitFor(() => expect(onAccept).toHaveBeenCalledWith('', { idType: 'voter_id', idLast4: 'AB12' }));
  });

  it('no ID step for a visitor under 18 or where the location takes none', async () => {
    show(<VisitorInviteScreen tenant="" visit={VISIT} stage="details" today={TODAY} live={{ state: 'ready', onRetry: vi.fn(), visit: pv({ idStep: false }), onAccept: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('checkbox', { name: /visitor notice and the privacy notice/ })).toBeInTheDocument();
  });
});

describe('VIS-05 watch-list (live)', () => {
  const entry = { id: 'w1', name: 'Manish Gupta', mobile: '+919884500712', reason: 'Photographed the packing line.', addedBy: 'Anita', addedAt: '2026-08-13T10:20:00Z', reviewedBy: null, reviewedAt: null, reviewBy: '2026-11-30T10:20:00Z' };
  const wl = (over: Partial<LiveWatchList> = {}): LiveWatchList => ({ state: 'ready', onRetry: vi.fn(), entries: [entry], reviewDays: 365, canChange: true, onAdd: vi.fn(async () => ({ blockedVisits: 2 })), onReview: vi.fn(async () => undefined), onRemove: vi.fn(async () => undefined), ...over });

  it('the list shows reasons and an entry close to lapsing', () => {
    show(<VisitorWatchListScreen entries={[]} today={TODAY} live={wl()} />);
    expect(screen.getByText('Photographed the packing line.')).toBeInTheDocument();
    expect(screen.getByText(/\(\d+ days\)/)).toBeInTheDocument();
  });

  it('adding needs a name and a reason; then it is added and the toast says how many visits were blocked', async () => {
    const live = wl();
    show(<VisitorWatchListScreen entries={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Add a person' }));
    const d = screen.getByRole('dialog', { name: 'Add a person to the watch-list' });
    await ue.click(within(d).getByRole('button', { name: 'Add to the watch-list' }));
    expect(live.onAdd).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Name/), 'Sunil Rawat');
    await ue.type(within(d).getByLabelText(/^Reason/), 'Abusive to reception staff.');
    await ue.click(within(d).getByRole('button', { name: 'Add to the watch-list' }));
    await waitFor(() => expect(live.onAdd).toHaveBeenCalledWith({ name: 'Sunil Rawat', reason: 'Abusive to reception staff.' }));
    expect(await screen.findByText('2 expected visits were blocked.')).toBeInTheDocument();
  });

  it('review keeps an entry; remove asks first', async () => {
    const live = wl();
    show(<VisitorWatchListScreen entries={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Reviewed, keep' }));
    await waitFor(() => expect(live.onReview).toHaveBeenCalledWith('w1'));
    await ue.click(screen.getByRole('button', { name: 'Remove' }));
    expect(live.onRemove).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('dialog', { name: /Remove Manish Gupta/ })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(live.onRemove).toHaveBeenCalledWith('w1'));
  });

  it('acting for someone else: the list only', () => {
    show(<VisitorWatchListScreen entries={[]} today={TODAY} live={wl({ canChange: false })} />);
    expect(screen.queryByRole('button', { name: 'Add a person' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });
});

describe('VIS-04 log and Settings 3.12 (slice 3)', () => {
  it('the photo of the ID opens from the log row; rows without one have no button', async () => {
    const onOpenIdImage = vi.fn(async () => undefined);
    show(<VisitorLogScreen log={[]} today={TODAY} live={{ state: 'ready', onRetry: vi.fn(), locations: [{ value: 'maa', label: 'Chennai office' }], onExport: vi.fn(), onOpenIdImage, visits: [v({ status: 'checked_out', statusText: 'Checked out', idType: 'passport', idText: 'Passport ··Z123', hasIdImage: true, deletedOn: '2026-12-01' }), v({ id: 'v2', name: 'Other', status: 'checked_out', statusText: 'Checked out', deletedOn: '2026-12-01' })] }} />);
    expect(screen.getByText('Passport ··Z123')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Photo of ID' })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Photo of ID' }));
    expect(onOpenIdImage).toHaveBeenCalledWith('v1');
  });

  it('ID capture has its three choices; the watch-list review period maps to its setting', () => {
    const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.12')!;
    const page = visitorSettingsPage(design, {
      canEdit: true, values: { 'visitors.id_capture': 'with_image', 'visitors.watchlist_review_days': '365' }, defaults: { 'visitors.id_capture': 'off', 'visitors.watchlist_review_days': '365' },
      choices: { 'visitors.id_capture': ['off', 'on', 'with_image'], 'visitors.watchlist_review_days': ['90', '180', '365'] },
      labels: { 'visitors.id_capture': { off: 'Off', on: 'ID type and last 4', with_image: 'ID type, last 4 and a photo of the ID' } }, overrides: {}, lastChange: null,
    });
    const f = (k: string) => page.sections.flatMap((s) => s.settings).find((d) => d.key === k);
    expect(f('vis.id_capture')).toMatchObject({ kind: 'select', value: 'with_image', optionLabels: { with_image: 'ID type, last 4 and a photo of the ID' } });
    expect(f('vis.watchlist_review_days')).toMatchObject({ kind: 'select', value: '365', starter: true });
    expect(visitorSettingsChanges({ 'vis.id_capture': 'on', 'vis.watchlist_review_days': '180' })).toEqual([
      { key: 'visitors.id_capture', value: 'on' },
      { key: 'visitors.watchlist_review_days', value: '180' },
    ]);
  });
});
