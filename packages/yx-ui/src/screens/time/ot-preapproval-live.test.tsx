import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceCalendarScreen, MusterScreen, type LiveMusterData, type LiveMyAttendance } from './attendance';
import { OnDutySentBackSheet, OtPreApproveSheet } from './requests';
import { ToastProvider } from '../../components/notify';
import type { DayCard, Muster, MyAttendance } from './live/types';

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

// Founder 2 Nov 2026 (overtime pre-approval, item 1): a manager pre-approves overtime for a report from the team muster
// (TIM-02 Manager, the TIM-07 Ot fields); approved at once on the server, never for themselves.
describe('TIM-02 Manager · Pre-approve overtime', () => {
  const person = (id: string, name: string, me = false) => ({ id, name, code: `KF-${id}`, location: 'Hosur plant', me, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [{ on: '2026-10-01', status: 'present' as const, leavePart: null, workedMinutes: 490, lateMinutes: null, regularised: false }] });
  const team: Muster = { month: '2026-10', from: '2026-10-01', to: '2026-10-31', scope: 'team', people: [person('d', 'Divya Raghunathan', true), person('k', 'Kavya Reddy'), person('a', 'Arjun Kulkarni')] };
  const muster = (over: Partial<LiveMusterData> = {}): LiveMusterData => ({ state: 'ready', data: team, month: '2026-10', onMonth: vi.fn(), onOpenDay: vi.fn(), today: '2026-10-09', ...over });
  const open = async () => {
    await ue.click(screen.getByRole('button', { name: 'Pre-approve overtime' }));
    return screen.getByRole('dialog', { name: 'Pre-approve overtime' });
  };

  it('pressed early it names what is missing; filled in it pre-approves for the report with a toast', async () => {
    const onPreApproveOt = vi.fn(async () => ({}));
    render(<ToastProvider><MusterScreen live={muster({ onPreApproveOt })} /></ToastProvider>);
    const sheet = await open();
    const go = within(sheet).getByRole('button', { name: 'Pre-approve' });
    expect(go).not.toBeDisabled();
    await ue.click(go);
    expect(onPreApproveOt).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText('Choose the person').length).toBeGreaterThan(0);
    expect(within(sheet).getByText('Enter the hours')).toBeInTheDocument();
    expect(within(sheet).getByText('Enter the reason')).toBeInTheDocument();
    // Never the manager's own row among the people.
    await ue.click(within(sheet).getByRole('combobox'));
    expect(screen.queryByRole('option', { name: /Divya Raghunathan/ })).toBeNull();
    await ue.click(screen.getByRole('option', { name: /Kavya Reddy/ }));
    await ue.type(within(sheet).getByLabelText(/^Planned OT/), '13');
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Month-end batch');
    await ue.click(go);
    expect(within(sheet).getAllByText('Enter at most 12 h').length).toBeGreaterThan(0);
    await ue.clear(within(sheet).getByLabelText(/^Planned OT/));
    await ue.type(within(sheet).getByLabelText(/^Planned OT/), '2.5');
    await ue.click(within(sheet).getByRole('radio', { name: 'Comp-off credit' }));
    expect(within(sheet).getByText('Up to 2 h 30 min OT · comp-off credit')).toBeInTheDocument();
    await ue.click(go);
    await waitFor(() => expect(onPreApproveOt).toHaveBeenCalledWith('k', { on: '2026-10-09', minutes: 150, takeAs: 'comp_off', reason: 'Month-end batch' }));
    expect(await screen.findByText('Overtime pre-approved for Kavya Reddy')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Pre-approve overtime' })).toBeNull();
  });

  it('quarter hours and at least half an hour', async () => {
    render(<MusterScreen live={muster({ onPreApproveOt: vi.fn() })} />);
    const sheet = await open();
    await ue.type(within(sheet).getByLabelText(/^Planned OT/), '1.3');
    await ue.click(within(sheet).getByRole('button', { name: 'Pre-approve' }));
    expect(within(sheet).getAllByText('Use quarter hours (e.g. 1.25 or 1.5)').length).toBeGreaterThan(0);
    await ue.clear(within(sheet).getByLabelText(/^Planned OT/));
    await ue.type(within(sheet).getByLabelText(/^Planned OT/), '0.25');
    await ue.click(within(sheet).getByRole('button', { name: 'Pre-approve' }));
    expect(within(sheet).getAllByText('Enter at least 0.5 h').length).toBeGreaterThan(0);
  });

  it("from a report's day card the person is chosen; a server refusal stays in the sheet and says why", async () => {
    const onPreApproveOt = vi.fn(async () => {
      throw new Error('Factory overtime is paid by law, not given as comp-off. Choose Paid overtime.');
    });
    const card: DayCard = { person: { name: 'Kavya Reddy', code: null }, on: '2026-10-01', zone: 'Asia/Kolkata', shift: { name: 'Day', start: 540, end: 1080, grace: 10 }, day: { status: 'present', leavePart: null, workedMinutes: 490, lateMinutes: null, regularised: false }, punches: [] };
    render(<MusterScreen live={muster({ onPreApproveOt, onOpenDay: vi.fn(async () => card) })} />);
    await ue.click(screen.getByRole('button', { name: /Kavya Reddy, 1 Oct 2026: Present/ }));
    const day = await screen.findByRole('dialog', { name: /Kavya Reddy · 1 Oct 2026/ });
    await ue.click(within(day).getByRole('button', { name: 'Pre-approve overtime' }));
    const sheet = screen.getByRole('dialog', { name: 'Pre-approve overtime' });
    expect(within(sheet).getByRole('combobox')).toHaveTextContent('Kavya Reddy');
    await ue.type(within(sheet).getByLabelText(/^Planned OT/), '2');
    await ue.click(within(sheet).getByRole('radio', { name: 'Comp-off credit' }));
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Line trial');
    await ue.click(within(sheet).getByRole('button', { name: 'Pre-approve' }));
    expect(await within(sheet).findByText('Factory overtime is paid by law, not given as comp-off. Choose Paid overtime.')).toBeInTheDocument();
    expect(within(sheet).getByText('Not pre-approved')).toBeInTheDocument();
  });

  it('not offered to HR on a granted muster, to someone with no reports, or without the call', () => {
    const a = render(<MusterScreen live={muster({ onPreApproveOt: vi.fn(), data: { ...team, scope: 'granted' } })} />);
    expect(screen.queryByRole('button', { name: 'Pre-approve overtime' })).toBeNull();
    a.unmount();
    const b = render(<MusterScreen live={muster({ onPreApproveOt: vi.fn(), data: { ...team, people: [team.people[0]!] } })} />);
    expect(screen.queryByRole('button', { name: 'Pre-approve overtime' })).toBeNull();
    b.unmount();
    render(<MusterScreen live={muster()} />);
    expect(screen.queryByRole('button', { name: 'Pre-approve overtime' })).toBeNull();
  });

  it('the design stories: the manager muster has the action; the sheet states render', async () => {
    const m = render(<MusterScreen persona="mgr" />);
    expect(screen.getByRole('button', { name: 'Pre-approve overtime' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Freeze inputs' })).toBeNull();
    m.unmount();
    const e = render(<OtPreApproveSheet sample="errors" />);
    expect(screen.getAllByText('Choose the person').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pick the date').length).toBeGreaterThan(0);
    e.unmount();
    const f = render(<OtPreApproveSheet sample="filled" />);
    expect(screen.getByText('Up to 2 h 30 min OT · paid at the overtime rate')).toBeInTheDocument();
    f.unmount();
    render(<OtPreApproveSheet sample="refused" />);
    expect(await screen.findByText(/Factory overtime is paid by law/)).toBeInTheDocument();
  });
});
