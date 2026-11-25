import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpenShiftsScreen, StandbyScreen } from './roster';
import type { LiveOpenShifts, OpenShiftBid, OpenShiftsData } from './open-shifts-live';
import type { LiveStandby, StandbyCallOut, StandbyData } from './standby-live';

// The designed TIM-35 and TIM-38 screens with the live app's data: every state each live page must show.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const bid = (over: Partial<OpenShiftBid>): OpenShiftBid => ({ id: 'b1', employeeId: 'e1', name: 'Deepa Ramesh', code: 'KF-01', status: 'waiting', bidAt: '2026-10-29T02:40:00Z', eligible: true, why: null, refusalCode: null, won30: 0, weekMinutes: 2400, rank: 1, ...over });
const OPEN: OpenShiftsData = {
  today: '2026-10-29',
  maxDaysAhead: 120,
  locations: [{ id: 'l1', name: 'Hosur plant', rule: 'manager_picks' }],
  shifts: [{ id: 's-n', name: 'Night', start: '22:00', end: '06:00', night: true }, { id: 's-m', name: 'Morning', start: '06:00', end: '14:00', night: false }],
  licenceTypes: [{ id: 'lt1', name: 'Forklift' }],
  rows: [
    { id: 'o1', on: '2026-11-07', location: { id: 'l1', name: 'Hosur plant' }, shift: { id: 's-n', name: 'Night', start: '22:00', end: '06:00', night: true }, licence: null, rule: 'manager_picks', status: 'open', closesAt: null, note: 'Line 2 short', awarded: null, version: 1, bids: [bid({}), bid({ id: 'b2', employeeId: 'e2', name: 'Arul Prakasam', won30: 2, rank: 2 }), bid({ id: 'b3', employeeId: 'e3', name: 'Babu Raj', eligible: false, why: 'No valid Forklift on this day', rank: null })] },
    { id: 'o2', on: '2026-11-03', location: { id: 'l1', name: 'Hosur plant' }, shift: { id: 's-m', name: 'Morning', start: '06:00', end: '14:00', night: false }, licence: { id: 'lt1', name: 'Forklift' }, rule: 'first_come', status: 'awarded', closesAt: null, note: null, awarded: { employeeId: 'e4', name: 'Mohammed Irfan' }, version: 2, bids: [] },
  ],
};
const open = (over: Partial<LiveOpenShifts> = {}): LiveOpenShifts => ({ state: 'ready', data: OPEN, onOffer: vi.fn(async () => ({})), onAward: vi.fn(async () => ({})), onCancel: vi.fn(async () => ({})), ...over });

describe('TIM-35 Open shifts, live', () => {
  it('lists open and awarded shifts; award picks the fair-order first, shows who cannot be picked, and toasts', async () => {
    const live = open();
    render(<OpenShiftsScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Open shifts and bids' })).toBeInTheDocument();
    expect(screen.getByText('awarded to Mohammed Irfan', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Line 2 short')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Pick claimant' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: 'Deepa Ramesh' })).toBeChecked();
    expect(within(dialog).getByText(/1st in the fair order/)).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: "Bids that can't be picked" })).toHaveTextContent('Babu Raj');
    await ue.click(within(dialog).getByRole('radio', { name: 'Arul Prakasam' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Award shift' }));
    await waitFor(() => expect(live.onAward).toHaveBeenCalledWith('o1', 'e2', 1));
    expect((await screen.findAllByText('Shift awarded to Arul Prakasam'))[0]).toBeInTheDocument();
  });

  it('a refused award stays in the dialog with the server’s reason', async () => {
    const live = open({ onAward: vi.fn(async () => Promise.reject(new Error('Deepa Ramesh: 4 h rest between two shifts (at least 11 h). The shift was not awarded.'))) });
    render(<OpenShiftsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Pick claimant' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Award shift' }));
    expect(await within(screen.getByRole('dialog')).findByText(/The shift was not awarded/)).toBeInTheDocument();
  });

  it('offer pressed without a date shows the field error and focuses it; cancel confirms and calls the API', async () => {
    const live = open();
    render(<OpenShiftsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Offer an open shift' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('radiogroup', { name: 'Award rule' })).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Offer shift' }));
    expect(await within(dialog).findByText('Pick a date')).toBeInTheDocument();
    expect(live.onOffer).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await ue.click(screen.getByRole('button', { name: 'Cancel offer' }));
    await ue.click(screen.getByRole('button', { name: 'Cancel open shift' }));
    await waitFor(() => expect(live.onCancel).toHaveBeenCalledWith('o1', 1));
  });

  it('empty, loading, error and no access', async () => {
    const { unmount } = render(<OpenShiftsScreen live={open({ data: { ...OPEN, rows: [] } })} />);
    expect(screen.getByText('No open shifts')).toBeInTheDocument();
    unmount();
    const l = render(<OpenShiftsScreen live={open({ state: 'loading', data: null })} />);
    expect(screen.queryByRole('button', { name: 'Offer an open shift' })).not.toBeInTheDocument();
    l.unmount();
    const retry = vi.fn();
    const e = render(<OpenShiftsScreen live={open({ state: 'error', data: null, onRetry: retry })} />);
    await ue.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(retry).toHaveBeenCalled();
    e.unmount();
    render(<OpenShiftsScreen live={open({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/open shifts/i, { selector: 'h2, h3, p' })).toBeInTheDocument();
  });
});

const CALL: StandbyCallOut = { id: 'c1', employeeId: 'e1', name: 'Anil Kumar', startedAt: '2026-10-28T20:30:00Z', endedAt: '2026-10-28T21:00:00Z', workedMinutes: 30, paidMinutes: 120, minimumApplied: true, reason: 'Compressor trip, Line 2 (phone call)', next: { on: '2026-10-29', shiftId: 's-g', name: 'General', start: '09:30', end: '18:00', startsAt: '2026-10-29T04:00:00Z' }, restMinutes: 420, minRestMinutes: 660, short: true, latest: true };
const STANDBY: StandbyData = {
  week: '2026-10-26',
  today: '2026-10-29',
  minimumHours: 2,
  planned: [{ employeeId: 'e1', name: 'Anil Kumar' }, { employeeId: 'e2', name: 'Senthil Murugan' }],
  shifts: [{ id: 's-g', code: 'G', name: 'General', start: '09:30', end: '18:00' }, { id: 's-e', code: 'E', name: 'Evening', start: '14:00', end: '22:00' }],
  slots: [{ id: 'sl1', employeeId: 'e1', name: 'Anil Kumar', startsAt: '2026-10-28T12:30:00Z', endsAt: '2026-10-29T00:30:00Z', status: 'planned', started: true }, { id: 'sl2', employeeId: 'e2', name: 'Senthil Murugan', startsAt: '2026-10-31T12:30:00Z', endsAt: '2026-11-01T00:30:00Z', status: 'planned', started: false }],
  people: [{ employeeId: 'e1', name: 'Anil Kumar', days: ['26', '27', '28', '29', '30', '31', '01'].map((x, i) => ({ on: i === 6 ? '2026-11-01' : `2026-10-${x}`, employed: true, standby: i === 2, shift: i < 5 ? { id: 's-g', code: 'G', name: 'General', start: '09:30', end: '18:00' } : null })) }],
  callOuts: [CALL],
};
const standby = (over: Partial<LiveStandby> = {}): LiveStandby => ({ state: 'ready', data: STANDBY, week: '2026-10-26', onWeek: vi.fn(), onSlot: vi.fn(async () => ({})), onCancelSlot: vi.fn(async () => ({})), onCallOut: vi.fn(async () => CALL), onMove: vi.fn(async () => ({})), ...over });

describe('TIM-38 Standby, live', () => {
  it('shows the grid, slots and the call-out log with the rest check; Move next shift moves it with a reason', async () => {
    const live = standby();
    render(<StandbyScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Standby and call-outs' })).toBeInTheDocument();
    expect(screen.getByText(/call-out paid at least 2 h/)).toBeInTheDocument();
    expect(screen.getByText(/paid 2 h \(minimum\)/)).toBeInTheDocument();
    expect(screen.getByText('Rest 7 h')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Move next shift' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/needs 11 h/)).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Move shift' }));
    await waitFor(() => expect(live.onMove).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e1', on: '2026-10-29', shiftId: 's-e', reason: expect.stringMatching(/Rest after the call-out/) })));
    expect((await screen.findAllByText('Shift moved'))[0]).toBeInTheDocument();
  });

  it('after the move: no short-rest badge; a future slot can be cancelled', async () => {
    const live = standby({ data: { ...STANDBY, callOuts: [{ ...CALL, next: { ...CALL.next!, shiftId: 's-e', name: 'Evening', start: '14:00', end: '22:00', startsAt: '2026-10-29T08:30:00Z' }, restMinutes: 690, short: false }] } });
    render(<StandbyScreen live={live} />);
    expect(screen.queryByRole('button', { name: 'Move next shift' })).not.toBeInTheDocument();
    expect(screen.getByText(/11 h 30 m rest/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(live.onCancelSlot).toHaveBeenCalledWith('sl2'));
  });

  it('log call-out pressed too early says what is missing; with times and a reason it logs once and toasts the rest', async () => {
    const live = standby();
    render(<StandbyScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Log call-out' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save call-out' }));
    expect(await within(dialog).findByText('Enter the start')).toBeInTheDocument();
    expect(live.onCallOut).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByLabelText('Start', { exact: false }), '2:00 am');
    await ue.type(within(dialog).getByLabelText('End', { exact: false }), '2:30 am');
    await ue.type(within(dialog).getByLabelText('Reason', { exact: false }), 'Compressor trip');
    await ue.click(within(dialog).getByRole('button', { name: 'Save call-out' }));
    await waitFor(() => expect(live.onCallOut).toHaveBeenCalledTimes(1));
    expect(vi.mocked(live.onCallOut).mock.calls[0][0]).toMatchObject({ employeeId: 'e1', startedAt: '2026-10-28T20:30:00.000Z', endedAt: '2026-10-28T21:00:00.000Z', reason: 'Compressor trip (phone call)' });
    expect((await screen.findAllByText('Call-out logged'))[0]).toBeInTheDocument();
  });

  it('set standby longer than 24 h shows the field error; within 24 h it saves', async () => {
    const live = standby();
    render(<StandbyScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Set standby' }));
    const dialog = screen.getByRole('dialog');
    const to = within(dialog).getAllByLabelText('At', { exact: false })[1];
    await ue.clear(to);
    await ue.type(to, '7:00 pm');
    await ue.click(within(dialog).getByRole('button', { name: 'Set standby' }));
    expect(await within(dialog).findByText('A standby slot is at most 24 hours')).toBeInTheDocument();
    expect(live.onSlot).not.toHaveBeenCalled();
    await ue.clear(to);
    await ue.type(to, '5:00 pm');
    await ue.click(within(dialog).getByRole('button', { name: 'Set standby' }));
    await waitFor(() => expect(live.onSlot).toHaveBeenCalledWith({ employeeId: 'e1', startsAt: '2026-10-29T12:30:00.000Z', endsAt: '2026-10-30T11:30:00.000Z' }));
  });

  it('empty week, loading, error and no access', async () => {
    const { unmount } = render(<StandbyScreen live={standby({ data: { ...STANDBY, people: [], slots: [], callOuts: [] } })} />);
    expect(screen.getByText('No one on standby this week')).toBeInTheDocument();
    expect(screen.getByText('No call-outs this week.')).toBeInTheDocument();
    unmount();
    const l = render(<StandbyScreen live={standby({ state: 'loading', data: null })} />);
    expect(screen.queryByRole('button', { name: 'Log call-out' })).not.toBeInTheDocument();
    l.unmount();
    const retry = vi.fn();
    const e = render(<StandbyScreen live={standby({ state: 'error', data: null, onRetry: retry })} />);
    expect(screen.getByText("Standby didn't load")).toBeInTheDocument();
    e.unmount();
    render(<StandbyScreen live={standby({ state: 'no-access', data: null })} />);
    expect(screen.queryByRole('button', { name: 'Log call-out' })).not.toBeInTheDocument();
  });
});
