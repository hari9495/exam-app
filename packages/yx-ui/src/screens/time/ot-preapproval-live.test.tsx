import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceCalendarScreen, type LiveMyAttendance } from './attendance';
import { OnDutySentBackSheet } from './requests';
import type { MyAttendance } from './live/types';

// Founder follow-ups, 2 Nov 2026: TIM-07 Ot pre-approval live, "New request" on My attendance, and the on-duty
// sent-back sheet (TIM-19 SentBack style).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ATT: MyAttendance = {
  employee: { id: 'e1', name: 'Arjun Kulkarni' },
  today: '2026-10-09',
  zone: 'Asia/Kolkata',
  mode: 'punch',
  shift: { name: 'General', start: 570, end: 1110, grace: 10, checkIn: 'restricted' },
  fences: [],
  punches: [],
  next: 'in',
  days: [],
  requests: [],
  regularise: { limit: 4, used: 1 },
  wfh: { limit: 4, used: 0 },
  onDuty: { aheadDays: 30, backDays: 60 },
  otPlans: [],
  otAheadDays: 30,
};
const live = (over: Partial<LiveMyAttendance> = {}): LiveMyAttendance => ({
  state: 'ready',
  data: ATT,
  month: '2026-10',
  onMonth: vi.fn(),
  getLocation: vi.fn(async () => ({ pin: null })),
  onPunch: vi.fn(),
  onFix: vi.fn(async () => ({})),
  onWithdrawFix: vi.fn(async () => ({})),
  onOpenDay: vi.fn(),
  now: new Date('2026-10-09T05:00:00Z'),
  ...over,
});
const openNew = async () => {
  await ue.click(screen.getByRole('button', { name: 'New request' }));
  return screen.getByRole('dialog', { name: 'New attendance request' });
};

describe('New request (My attendance)', () => {
  it('offers only the choices the person may use', async () => {
    render(<AttendanceCalendarScreen live={live({ onWfh: vi.fn(), onOnDuty: vi.fn(), onOtPlan: vi.fn() })} />);
    const sheet = await openNew();
    expect(within(sheet).getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/Regularise/), expect.stringMatching(/WFH/), expect.stringMatching(/On duty/), expect.stringMatching(/OT/)]));
  });

  it('not in punch mode: no Regularise; on duty only: no choice to make', async () => {
    render(<AttendanceCalendarScreen live={live({ data: { ...ATT, mode: 'assumed_present' }, onOnDuty: vi.fn() })} />);
    await ue.click(screen.getByRole('button', { name: 'New request' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByRole('radio', { name: 'Regularise' })).toBeNull();
    expect(within(sheet).getByRole('textbox', { name: /Where/ })).toBeInTheDocument();
  });

  it('no request the person may make: no New request button', () => {
    render(<AttendanceCalendarScreen live={live({ data: { ...ATT, mode: 'assumed_present' } })} />);
    expect(screen.queryByRole('button', { name: 'New request' })).toBeNull();
  });
});

describe('TIM-07 Ot pre-approval, live', () => {
  it('pressed early it asks for the hours; quarter hours only; then it is sent with the hours, how it is taken and the reason, and a toast', async () => {
    const onOtPlan = vi.fn(async () => ({}));
    render(<AttendanceCalendarScreen live={live({ onOtPlan })} />);
    const sheet = await openNew();
    await ue.click(within(sheet).getByRole('radio', { name: 'OT' }));
    expect(within(sheet).getByText('No OT approved')).toBeInTheDocument();
    const send = within(sheet).getByRole('button', { name: 'Send request' });
    expect(send).not.toBeDisabled();
    await ue.click(send);
    expect(onOtPlan).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText('Enter the planned hours').length).toBeGreaterThan(0);
    await waitFor(() => expect(document.activeElement).toBe(within(sheet).getByLabelText(/^Planned OT/)));
    await ue.type(within(sheet).getByLabelText(/^Planned OT/), '1.3');
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Batch release');
    await ue.click(send);
    expect(within(sheet).getAllByText('Use quarter hours (e.g. 1.25 or 1.5)').length).toBeGreaterThan(0);
    await ue.clear(within(sheet).getByLabelText(/^Planned OT/));
    await ue.type(within(sheet).getByLabelText(/^Planned OT/), '2');
    expect(within(sheet).getByText('Up to 2 h OT · paid at the overtime rate')).toBeInTheDocument();
    await ue.click(send);
    await waitFor(() => expect(onOtPlan).toHaveBeenCalledWith({ on: '2026-10-09', minutes: 120, takeAs: 'pay', reason: 'Batch release' }));
    expect(await screen.findByText('Sent to your manager')).toBeInTheDocument();
  });

  it('a day already asked for is refused on the date; a server refusal says why', async () => {
    const onOtPlan = vi.fn(async () => { throw new Error('Factory overtime is paid by law, not given as comp-off. Choose Paid overtime.'); });
    render(<AttendanceCalendarScreen live={live({ onOtPlan, data: { ...ATT, otPlans: [{ id: 'p1', on: '2026-10-09', minutes: 60, takeAs: 'pay', reason: 'x', status: 'pending' }] } })} />);
    const sheet = await openNew();
    await ue.click(within(sheet).getByRole('radio', { name: 'OT' }));
    expect(within(sheet).getAllByText('9 Oct 2026 already has overtime asked for').length).toBeGreaterThan(0);
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    expect(onOtPlan).not.toHaveBeenCalled();
  });

  it('a waiting pre-approval is listed and can be withdrawn after a confirm', async () => {
    const onWithdrawOtPlan = vi.fn(async () => ({}));
    render(<AttendanceCalendarScreen live={live({ onOtPlan: vi.fn(), onWithdrawOtPlan, data: { ...ATT, otPlans: [{ id: 'p1', on: '2026-10-12', minutes: 90, takeAs: 'comp_off', reason: 'x', status: 'pending' }] } })} />);
    const list = screen.getByRole('list', { name: 'Waiting for approval' });
    expect(within(list).getByText('12 Oct 2026 · Overtime pre-approval')).toBeInTheDocument();
    expect(within(list).getByText(/comp-off · with your manager/)).toBeInTheDocument();
    await ue.click(within(list).getByRole('button', { name: 'Withdraw' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw request' }));
    await waitFor(() => expect(onWithdrawOtPlan).toHaveBeenCalledWith('p1'));
  });
});

describe('On duty sent back (TIM-07, TIM-19 SentBack style)', () => {
  it('the story shows what the manager asked, the request and both actions', () => {
    render(<OnDutySentBackSheet />);
    const sheet = screen.getByRole('dialog', { name: /On duty · 30 Sep 2026/ });
    expect(within(sheet).getByText(/sent it back for changes/)).toBeInTheDocument();
    expect(within(sheet).getByText('Hosur plant')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Change and send again' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
  });

  it('live: View opens it; Change and send again opens the request with what was sent; Withdraw asks first', async () => {
    const onWithdrawFix = vi.fn(async () => ({}));
    const sent = { id: 'od9', on: '2026-10-08', kind: 'on_duty' as const, inMinute: 540, outMinute: 1020, reason: 'Audit', status: 'sent_back' as const, place: 'Hosur', sentBack: 'Add the plant name in full' };
    render(<AttendanceCalendarScreen live={live({ onOnDuty: vi.fn(), onWithdrawFix, data: { ...ATT, manager: 'Divya Menon', requests: [sent] } })} />);
    await ue.click(within(screen.getByRole('list', { name: 'Waiting for approval' })).getByRole('button', { name: 'View' }));
    const sheet = screen.getByRole('dialog', { name: /On duty · 8 Oct 2026/ });
    expect(within(sheet).getByText('Divya Menon sent it back for changes')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Withdraw' }));
    await ue.click(screen.getByRole('button', { name: 'Keep request' }));
    expect(onWithdrawFix).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('dialog', { name: /On duty · 8 Oct 2026/ })).getByRole('button', { name: 'Change and send again' }));
    const again = screen.getByRole('dialog', { name: 'Change and send again' });
    expect(within(again).getByRole('textbox', { name: /Where/ })).toHaveValue('Hosur');
  });
});
