import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DevicesScreen } from './ops';
import { KioskScreen } from './field';
import type { DevicesData, LiveDevices } from './devices-live';
import type { LiveKiosk } from './kiosk-live';

// The designed TIM-14 and TIM-13 screens with the live app's data: what each live page must do.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const NOW = new Date('2026-10-29T10:00:00+05:30');
const mins = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const DATA: DevicesData = {
  kiosks: [
    { id: 'k1', code: 'HSR-K1', place: 'Gate 1', locationId: 'l1', location: 'Hosur plant', entity: 'Kaveri Foods', mode: 'attendance', status: 'online', lastSeenAt: mins(1), setupExpiresAt: null, checkInsToday: 12 },
    { id: 'k2', code: 'HSR-K2', place: 'Canteen', locationId: 'l1', location: 'Hosur plant', entity: 'Kaveri Foods', mode: 'attendance', status: 'offline', lastSeenAt: mins(180), setupExpiresAt: null, checkInsToday: 0 },
    { id: 'k3', code: 'MAA-K1', place: 'Reception', locationId: 'l2', location: 'Chennai office', entity: 'Kaveri Foods', mode: 'visitor', status: 'not_set_up', lastSeenAt: null, setupExpiresAt: mins(-20), checkInsToday: null },
  ],
  requests: [
    { id: 'r1', employeeId: 'e1', person: 'Meera Krishnan', site: 'Chennai office', model: 'Samsung Galaxy M34', oldModel: 'Redmi Note 11', oldLastSeenAt: mins(3000), oldPhoneLost: true, reason: 'Old phone lost', raisedAt: mins(60 * 50) },
    { id: 'r2', employeeId: 'e2', person: 'Kavitha Sundaram', site: 'Hosur plant', model: 'Nokia G21', oldModel: null, oldLastSeenAt: null, oldPhoneLost: false, reason: 'First smartphone', raisedAt: mins(60) },
  ],
  phones: [
    { id: 'p1', employeeId: 'e1', person: 'Meera Krishnan', model: 'Redmi Note 11', appVersion: '4.2.0', lastSeenAt: mins(3000), status: 'lost' },
    { id: 'p2', employeeId: 'e3', person: 'Divya Raghunathan', model: 'Pixel 7a', appVersion: null, lastSeenAt: mins(22), status: 'active' },
  ],
  locations: [{ id: 'l1', name: 'Hosur plant', entity: 'Kaveri Foods' }, { id: 'l2', name: 'Chennai office', entity: 'Kaveri Foods' }],
  entities: 1,
};
const KEY = { code: 'HSR-K3', setupCode: 'K7PQ-M2XD-9RTA', setupExpiresAt: mins(-30) };
const devices = (o: Partial<LiveDevices> = {}): LiveDevices => ({ state: 'ready', data: DATA, company: 'Kaveri Foods', now: NOW, onRetry: vi.fn(), onRegister: vi.fn(async () => KEY), onReset: vi.fn(async () => KEY), onApprove: vi.fn(async () => ({})), onRefuse: vi.fn(async () => ({})), onSignOut: vi.fn(async () => ({})), ...o });

describe('Devices and kiosks (TIM-14 live)', () => {
  it('shows kiosks with health, an offline alert and today’s check-ins', () => {
    render(<DevicesScreen live={devices()} />);
    expect(screen.getByText('HR · Kaveri Foods')).toBeInTheDocument();
    expect(screen.getByText('HSR-K1')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Not set up')).toBeInTheDocument();
    expect(screen.getByText('HSR-K2 · Canteen has been offline for 3 h')).toBeInTheDocument();
    expect(screen.getByText('Not synced')).toBeInTheDocument();
  });

  it('registers a kiosk: pressed too early it says what is missing; then the set-up key stays on screen', async () => {
    const live = devices();
    render(<DevicesScreen live={live} />);
    await ue.click(screen.getAllByRole('button', { name: 'Register kiosk' })[0]);
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Register kiosk' }));
    expect(within(dialog).getByText('Enter the place on site.')).toBeInTheDocument();
    expect(live.onRegister).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Place on site/ }), 'Gate 2');
    await ue.click(within(dialog).getByRole('combobox'));
    await ue.click(await screen.findByRole('option', { name: 'Hosur plant' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Register kiosk' }));
    await waitFor(() => expect(live.onRegister).toHaveBeenCalledWith({ place: 'Gate 2', locationId: 'l1', mode: 'attendance' }));
    expect(await screen.findByText('Set-up key for HSR-K3: K7PQ-M2XD-9RTA')).toBeInTheDocument();
  });

  it('a refusal needs a reason; approving a replacement asks first', async () => {
    const live = devices();
    render(<DevicesScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: /New phone requests/ }));
    const row = screen.getByText('Meera Krishnan').closest('tr')!;
    await ue.click(within(row).getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Reject request' }));
    expect(within(dialog).getByText('Choose a reason.')).toBeInTheDocument();
    expect(live.onRefuse).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await ue.click(within(row).getByRole('button', { name: 'Approve' }));
    await ue.click(await screen.findByRole('button', { name: 'Approve and sign out Redmi Note 11' }));
    await waitFor(() => expect(live.onApprove).toHaveBeenCalledWith('r1'));
    // A first phone is approved at once.
    await ue.click(within(screen.getByText('Kavitha Sundaram').closest('tr')!).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(live.onApprove).toHaveBeenCalledWith('r2'));
  });

  it('Training tab (TIM-14): the sessions from the API; Add sends to the API with the location from the kiosks data', async () => {
    const onAdd = vi.fn(async () => ({}));
    const rows = [{ id: 's1', title: 'Fire drill', room: null, location: { id: 'l1', name: 'Hosur plant', zone: 'Asia/Kolkata' }, startsAt: '2026-11-03T04:00:00Z', endsAt: '2026-11-03T05:00:00Z', invitees: [], present: 0, state: 'upcoming' as const, version: 1 }];
    render(<DevicesScreen live={devices({ training: { rows, onFindPeople: vi.fn(async () => []), onAdd, onEdit: vi.fn(), onCancel: vi.fn() } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Training' }));
    expect(await screen.findByText('Fire drill')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Add training' })[0]!);
    const drawer = await screen.findByRole('dialog', { name: 'Add training' });
    await ue.click(within(drawer).getByRole('combobox', { name: /Location/ }));
    expect(await screen.findByRole('option', { name: 'Chennai office' })).toBeInTheDocument();
  });

  it('no Training tab when the app does not pass it', () => {
    render(<DevicesScreen live={devices()} />);
    expect(screen.queryByRole('tab', { name: 'Training' })).toBeNull();
  });

  it('signs out a lost phone remotely', async () => {
    const live = devices();
    render(<DevicesScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: /Employee phones/ }));
    await ue.click(screen.getByRole('button', { name: 'Sign out remotely' }));
    await ue.click(await screen.findByRole('button', { name: 'Sign out phone' }));
    await waitFor(() => expect(live.onSignOut).toHaveBeenCalledWith('p1'));
  });

  it('empty, loading, error and no access', () => {
    const { unmount } = render(<DevicesScreen live={devices({ data: { ...DATA, kiosks: [] } })} />);
    expect(screen.getByText('No kiosks registered')).toBeInTheDocument();
    unmount();
    const u2 = render(<DevicesScreen live={devices({ state: 'error', data: null })} />);
    expect(screen.getByText('Devices could not load')).toBeInTheDocument();
    u2.unmount();
    const u3 = render(<DevicesScreen live={devices({ state: 'no-access', data: null })} />);
    expect(screen.getByText("You don't have access to devices and kiosks")).toBeInTheDocument();
    u3.unmount();
    render(<DevicesScreen live={devices({ state: 'loading', data: null })} />);
    expect(screen.queryByText('No kiosks registered')).not.toBeInTheDocument();
  });
});

const INFO = { company: 'Kaveri Foods', location: 'Hosur plant', place: 'Gate 1', code: 'HSR-K1', mode: 'attendance', methods: ['pin', 'qr'], codePrefix: 'KF-', codeDigits: 4, pinTries: 5, zone: 'Asia/Kolkata' };
const kiosk = (o: Partial<LiveKiosk> = {}): LiveKiosk => ({
  state: 'ready',
  info: INFO,
  onSetup: vi.fn(async () => ({})),
  onIdentify: vi.fn(async () => ({ person: 'pass', firstName: 'Kavitha' })),
  onToday: vi.fn(async () => ({ firstName: 'Kavitha', today: '2026-10-29', shift: { name: 'Morning', start: 360, end: 840, grace: 10 }, punches: [], next: 'in' as const, requests: [{ id: 'q1', kind: 'leave', label: 'Casual leave', from: '2026-11-05', to: '2026-11-06', days: 2, status: 'pending' }] })),
  onPunch: vi.fn(async () => ({ accepted: true, message: 'Checked in. At the Hosur plant kiosk', at: '2026-10-29T00:32:00.000Z', kind: 'in' })),
  ...o,
});
const type = async (digits: string) => {
  for (const d of digits) await ue.click(screen.getByRole('button', { name: d }));
};

describe('Kiosk (TIM-13 live)', () => {
  it('code, PIN, first name only, check in, then it clears itself', async () => {
    const live = kiosk({ clearAfter: 1 });
    render(<KioskScreen live={live} />);
    expect(screen.getByText('KF-____')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Type all 4 digits of your code.')).toBeInTheDocument();
    await type('0142');
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Enter your PIN')).toBeInTheDocument();
    await type('4071');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(live.onIdentify).toHaveBeenCalledWith({ method: 'pin', code: 'KF-0142', pin: '4071' }));
    expect(await screen.findByText('Hello, Kavitha')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'My requests' }));
    expect(screen.getByText('Casual leave · 5 Nov 2026 – 6 Nov 2026')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Back' }));
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(live.onPunch).toHaveBeenCalledWith('pass', 'in'));
    expect(await screen.findByText('Checked in')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('KF-____')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.queryByText(/Kavitha/)).not.toBeInTheDocument();
  });

  it('an unknown code is refused before the PIN with the design message; typing again clears it', async () => {
    const live = kiosk({ onCheckCode: vi.fn(async () => { throw Object.assign(new Error('No one with code KF-9999.'), { code: 'UNKNOWN_CODE' }); }) });
    render(<KioskScreen live={live} />);
    await type('9999');
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('No one with code KF-9999')).toBeInTheDocument();
    expect(screen.getByText('Check the code on your ID card and try again.')).toBeInTheDocument();
    expect(screen.queryByText('Enter your PIN')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('This code is not known. Check it and type it again.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('No one with code KF-9999')).not.toBeInTheDocument();
  });

  const signIn = async () => {
    await type('0142');
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    await type('4071');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Hello, Kavitha');
  };

  it('training: before it opens it says when; once open the person is marked present', async () => {
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    const session = (opensAt: string) => ({ zone: 'Asia/Kolkata', sessions: [{ id: 's1', title: 'Food safety refresher', room: 'Training room 1', startsAt: soon, endsAt: new Date(Date.now() + 7_200_000).toISOString(), opensAt, marked: false }] });
    const onTraining = vi.fn().mockResolvedValueOnce(session(soon)).mockResolvedValue(session(new Date(Date.now() - 60_000).toISOString()));
    const onMarkTraining = vi.fn(async () => ({}));
    const live = kiosk({ onCheckCode: vi.fn(async () => ({ known: true })), onTraining, onMarkTraining });
    render(<KioskScreen live={live} />);
    await signIn();
    await ue.click(screen.getByRole('button', { name: 'Training' }));
    expect(await screen.findByText('Mark training attendance')).toBeInTheDocument();
    expect(screen.getByText('Food safety refresher')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Mark me present' }));
    expect(screen.getByText(/^Training opens at/)).toBeInTheDocument();
    expect(onMarkTraining).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Back' }));
    await ue.click(screen.getByRole('button', { name: 'Training' }));
    await ue.click(await screen.findByRole('button', { name: 'Mark me present' }));
    await waitFor(() => expect(onMarkTraining).toHaveBeenCalledWith('pass', 's1'));
    expect(await screen.findByText('Marked present')).toBeInTheDocument();
  });

  it('training: none today says so', async () => {
    render(<KioskScreen live={kiosk({ onTraining: vi.fn(async () => ({ zone: 'Asia/Kolkata', sessions: [] })), onMarkTraining: vi.fn() })} />);
    await signIn();
    await ue.click(screen.getByRole('button', { name: 'Training' }));
    expect(await screen.findByText('No training here today.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark me present' })).not.toBeInTheDocument();
  });

  const LEAVE = {
    today: '2026-10-29',
    types: [{ id: 'cl', name: 'Casual leave', kind: 'casual', available: 1, pending: 2 }, { id: 'el', name: 'Earned leave', kind: 'earned', available: 0, pending: 0 }],
    sick: { name: 'Sick leave', available: 7 },
    approver: 'Ramesh Iyer',
    days: [
      { on: '2026-10-30', note: null, holiday: null, hint: null },
      { on: '2026-10-31', note: null, holiday: null, hint: null },
      { on: '2026-11-01', note: 'Weekly off' as const, holiday: null, hint: null },
      { on: '2026-11-02', note: null, holiday: 'Kannada Rajyotsava', hint: 'Holiday shift' },
    ],
  };

  it('kiosk.leave off for the person here: the menu has no Apply leave (on: it has)', async () => {
    const today = { firstName: 'Kavitha', today: '2026-10-29', shift: null, punches: [], next: 'in' as const, requests: [] };
    const { unmount } = render(<KioskScreen live={kiosk({ onLeave: vi.fn(async () => LEAVE), onToday: vi.fn(async () => ({ ...today, leave: false })) })} />);
    await signIn();
    expect(screen.queryByRole('button', { name: 'Apply leave' })).toBeNull();
    expect(screen.getByRole('button', { name: 'My requests' })).toBeInTheDocument();
    unmount();
    render(<KioskScreen live={kiosk({ onLeave: vi.fn(async () => LEAVE), onToday: vi.fn(async () => ({ ...today, leave: true })) })} />);
    await signIn();
    expect(screen.getByRole('button', { name: 'Apply leave' })).toBeInTheDocument();
  });

  it('apply leave: picks days, refuses too many and locked days, then sends to the approver', async () => {
    const onApplyLeave = vi.fn(async () => ({ id: 'r1' }));
    render(<KioskScreen live={kiosk({ onLeave: vi.fn(async () => LEAVE), onApplyLeave })} />);
    await signIn();
    await ue.click(screen.getByRole('button', { name: 'Apply leave' }));
    expect(await screen.findByText('Apply leave')).toBeInTheDocument();
    expect(screen.getByText(/ask Ramesh Iyer to record sick days/)).toBeInTheDocument();
    expect(screen.getByText(/is a holiday \(Kannada Rajyotsava\) you are rostered to work/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send leave request' }));
    expect(screen.getByText('Pick at least one day.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Earned · 0 left/ }));
    expect(screen.getByText('No days of this leave are left.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Weekly off/ }));
    expect(screen.getByText('You cannot pick this day: Weekly off.')).toBeInTheDocument();
    const tiles = within(screen.getByRole('group', { name: 'Leave dates' })).getAllByRole('button');
    await ue.click(tiles[0]!);
    await ue.click(tiles[1]!);
    await ue.click(screen.getByRole('button', { name: 'Send leave request' }));
    expect(screen.getByText('Not enough leave left for these days.')).toBeInTheDocument();
    expect(onApplyLeave).not.toHaveBeenCalled();
    await ue.click(tiles[0]!);
    await ue.click(screen.getByRole('button', { name: 'Send leave request' }));
    await waitFor(() => expect(onApplyLeave).toHaveBeenCalledWith('pass', { leaveTypeId: 'cl', from: '2026-10-30', to: '2026-10-30' }));
    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(screen.getByText(/Sent to Ramesh Iyer/)).toBeInTheDocument();
  });

  it('apply leave: a refusal from the server shows in plain words', async () => {
    const onApplyLeave = vi.fn(async () => { throw new Error('Casual leave needs 2 days notice.'); });
    render(<KioskScreen live={kiosk({ onLeave: vi.fn(async () => LEAVE), onApplyLeave })} />);
    await signIn();
    await ue.click(screen.getByRole('button', { name: 'Apply leave' }));
    const tiles = within(await screen.findByRole('group', { name: 'Leave dates' })).getAllByRole('button');
    await ue.click(tiles[0]!);
    await ue.click(screen.getByRole('button', { name: 'Send leave request' }));
    expect(await screen.findByText('Casual leave needs 2 days notice.')).toBeInTheDocument();
  });

  it('a wrong code or PIN shows the same plain refusal', async () => {
    const live = kiosk({ onIdentify: vi.fn(async () => { throw new Error("Code or PIN didn't match. After 5 wrong tries a code locks for 15 minutes."); }) });
    render(<KioskScreen live={live} />);
    await type('9999');
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    await type('1111');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/After 5 wrong tries a code locks for 15 minutes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan ID card' })).toBeInTheDocument();
  });

  it('set-up: a short key is refused on the spot; the key goes to the API', async () => {
    const live = kiosk({ state: 'setup', info: null });
    render(<KioskScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Set up kiosk' }));
    expect(screen.getByText('Type all 12 letters and digits of the set-up key.')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Set-up key/ }), 'K7PQ-M2XD-9RTA');
    await ue.click(screen.getByRole('button', { name: 'Set up kiosk' }));
    await waitFor(() => expect(live.onSetup).toHaveBeenCalledWith('K7PQ-M2XD-9RTA'));
  });

  it('offline: says so on the code screen', () => {
    render(<KioskScreen live={kiosk({ offline: true })} />);
    expect(screen.getByText('No connection')).toBeInTheDocument();
  });
});
