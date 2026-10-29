import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OneTimePayScreen, QueryQueueScreen, RecoveriesScreen } from './payroll-inputs';
import { replyDueIn, type LiveInputs, type LiveQueries, type LiveRecoveriesData } from './payroll-inputs-live';
import { PEOPLE } from './live/fixtures-5j';
import { QUERIES } from './live/fixtures-ops';

// Payroll › Inputs (PAY-04 … 06), Payslip queries (PAY-20) and the PAY-19 tabs: the designed screens with `live`.
// Ported from the old live copies' tests (pay-ops-live "payslip queries"), positive and negative.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const search = vi.fn(async () => PEOPLE.map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined })));
const ok = () => vi.fn(async () => ({}) as never);

const inputs = (over: Partial<LiveInputs> = {}): LiveInputs => ({
  state: 'ready',
  month: '2026-09',
  onMonth: vi.fn(),
  today: '2026-09-29',
  nameOf,
  onSearch: search,
  tab: 'onetime',
  lop: { state: 'ready', rows: [{ employeeId: 'p1', lopDays: '2.00', reason: 'Absent without leave', source: 'manual' }], onSave: ok() },
  oneTime: { rows: [{ id: 'o1', employeeId: 'p2', componentCode: 'bonus', amount: '15000.00', month: '2026-09', endOn: null, source: 'manual', reason: 'Spot award', status: 'approved' }], onAdd: vi.fn(async () => ({ status: 'approved' })), onCancel: ok() },
  holds: { state: 'ready', rows: [{ id: 'h1', employeeId: 'p3', reasonCode: 'exit_pending', note: 'Clearance not done', amount: '42000.00', released: false, ageDays: 40 }], onAdd: vi.fn(async () => ({ id: 'h2', created: true })), onRelease: ok() },
  ...over,
});
const pick = async (who = 'Divya Raghunathan') => {
  await ue.click(screen.getByRole('button', { name: 'Search' }));
  await ue.click(await screen.findByRole('button', { name: new RegExp(who) }));
};

describe('Payroll › Inputs (PAY-04 … 06 live)', () => {
  it('renders the designed tabs for the month; loading and no access show their states', () => {
    const { unmount } = render(<OneTimePayScreen live={inputs()} />);
    expect(screen.getByRole('heading', { name: 'Payroll inputs' })).toBeInTheDocument();
    for (const t of ['Loss of pay', 'One-time pay', 'Salary holds']) expect(screen.getByRole('tab', { name: new RegExp(t) })).toBeInTheDocument();
    expect(screen.getByText('Divya Raghunathan')).toBeInTheDocument();
    unmount();
    const { unmount: u2 } = render(<OneTimePayScreen live={inputs({ state: 'loading' })} />);
    expect(screen.getByRole('status', { name: 'Loading payroll inputs' })).toBeInTheDocument();
    u2();
    render(<OneTimePayScreen live={inputs({ state: 'no-access' })} />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('one-time pay: pressed too early shows the errors and focuses the first; a filled form is sent and toasted', async () => {
    const live = inputs();
    render(<OneTimePayScreen live={live} />);
    await ue.click(screen.getAllByRole('button', { name: 'Add one-time pay' })[0]);
    const drawer = screen.getByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Add one-time pay' }));
    expect(within(drawer).getAllByText('Choose the employee.').length).toBeGreaterThan(0);
    expect(live.oneTime.onAdd).not.toHaveBeenCalled();
    await pick();
    await ue.type(within(drawer).getByRole('textbox', { name: /^Amount/ }), '25000');
    await ue.type(within(drawer).getByRole('textbox', { name: /Reason/ }), 'Festival bonus');
    await ue.click(within(drawer).getByRole('button', { name: 'Add one-time pay' }));
    await waitFor(() => expect(live.oneTime.onAdd).toHaveBeenCalledWith({ employeeId: 'p2', componentCode: 'bonus', amount: '25000', month: '2026-09', reason: 'Festival bonus' }));
    expect((await screen.findAllByText(/Bonus of ₹25,000 for Divya Raghunathan added/)).length).toBeGreaterThan(0);
  });

  it('one-time pay above the company limit says it waits for approval; an API refusal stays in the drawer', async () => {
    const live = inputs();
    live.oneTime.onAdd = vi.fn().mockResolvedValueOnce({ status: 'pending' }).mockRejectedValueOnce(new Error('September 2026 is locked. Add it to the next month.'));
    render(<OneTimePayScreen live={live} />);
    const fill = async () => {
      await ue.click(screen.getAllByRole('button', { name: 'Add one-time pay' })[0]);
      const d = screen.getByRole('dialog');
      await pick();
      await ue.type(within(d).getByRole('textbox', { name: /^Amount/ }), '500000');
      await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Retention bonus');
      await ue.click(within(d).getByRole('button', { name: 'Add one-time pay' }));
      return d;
    };
    await fill();
    expect((await screen.findAllByText(/waits for approval/)).length).toBeGreaterThan(0);
    const d = await fill();
    expect(await within(d).findByText('September 2026 is locked. Add it to the next month.')).toBeInTheDocument();
  });

  it('one-time pay: cancel asks first, then cancels', async () => {
    const live = inputs();
    render(<OneTimePayScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Cancel' }));
    await ue.click(screen.getByRole('button', { name: 'Cancel the item' }));
    await waitFor(() => expect(live.oneTime.onCancel).toHaveBeenCalledWith('o1'));
  });

  it('loss of pay: more days than the month is refused before sending; a right row is saved', async () => {
    const live = inputs({ tab: 'lop' });
    render(<OneTimePayScreen live={live} />);
    expect(screen.getByText('Arjun Kulkarni')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save LOP' }));
    expect((await screen.findAllByText(/Nothing to save/)).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Add loss of pay' }));
    const d = screen.getByRole('dialog');
    await pick('Sridhar Fernandes');
    await ue.type(within(d).getByRole('textbox', { name: /Unpaid days/ }), '31');
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Unapproved absence');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(within(d).getAllByText('Enter 30 days or fewer.').length).toBeGreaterThan(0);
    expect(live.lop.onSave).not.toHaveBeenCalled();
    await ue.clear(within(d).getByRole('textbox', { name: /Unpaid days/ }));
    await ue.type(within(d).getByRole('textbox', { name: /Unpaid days/ }), '2');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(live.lop.onSave).toHaveBeenCalledWith([{ employeeId: 'p3', lopDays: '2', reason: 'Unapproved absence' }], 'manual'));
  });

  it('loss of pay: a CSV is checked row by row; only good rows are imported, as an upload', async () => {
    const live = inputs({ tab: 'lop' });
    live.onSearch = vi.fn(async (q: string) => PEOPLE.filter((p) => p.employeeCode === q).map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined })));
    render(<OneTimePayScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Bulk upload' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: /Import/ }));
    expect(within(d).getByText('Upload a file first')).toBeInTheDocument();
    const csv = 'Employee ID,Employee name,LOP days,Reason\nKF-0142,Arjun,2,Absent\nKF-9999,Nobody,1,Absent\nKF-0117,Divya,40,Absent\n';
    await ue.upload(d.querySelector('input[type=file]') as HTMLInputElement, new File([csv], 'lop.csv', { type: 'text/csv' }));
    expect(await within(d).findByText(/1 rows ready · 2 rows with errors/)).toBeInTheDocument();
    expect(within(d).getByText(/No employee with ID KF-9999/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Import 1 valid rows' }));
    await waitFor(() => expect(live.lop.onSave).toHaveBeenCalledWith([{ employeeId: 'p1', lopDays: '2', reason: 'Absent' }], 'upload'));
  });

  it('holds (item 10): "Next bank file" says it pays in the next monthly run, not the run it was held in', async () => {
    const live = inputs({ tab: 'holds' });
    render(<OneTimePayScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    expect(screen.getByText(/bank file of the next monthly run \(not the run it was held in\)/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Reason for release/ }), 'Clearance done today');
    await ue.click(screen.getByRole('button', { name: /^Release ₹42,000/ }));
    expect(screen.getByText(/Paid in the next monthly run’s bank file/)).toBeInTheDocument();
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Release' }));
    await waitFor(() => expect(live.holds.onRelease).toHaveBeenCalledWith('h1', { reason: 'Clearance done today', route: 'next_bank_file' }));
    expect((await screen.findAllByText(/released into the next monthly run’s bank file/)).length).toBeGreaterThan(0);
  });

  it('holds: a refused release (nothing held yet for off-cycle) says why and stays open', async () => {
    const live = inputs({ tab: 'holds' });
    live.holds.onRelease = vi.fn(async () => {
      throw new Error('Nothing is held in an approved run yet. Release into the next bank file: the next run pays as usual.');
    });
    render(<OneTimePayScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    await ue.type(screen.getByRole('textbox', { name: /Reason for release/ }), 'Clearance done today');
    await ue.click(screen.getByRole('radio', { name: 'Off-cycle payment now' }));
    await ue.click(screen.getByRole('button', { name: /^Release ₹42,000/ }));
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Release' }));
    expect((await screen.findAllByText(/Nothing is held in an approved run yet/)).length).toBeGreaterThan(0);
    // Nothing closed: the confirm stays open over the drawer, and the hold is still open.
    expect(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Release' })).toBeInTheDocument();
  });

  it('holds: the ageing chart counts open holds; release asks first; holding needs a reason code and a note', async () => {
    const live = inputs({ tab: 'holds' });
    render(<OneTimePayScreen live={live} />);
    expect(screen.getByText('Hold ageing')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    // Negative: no reason yet. The button is not disabled; the error shows and the reason box takes focus.
    await ue.click(screen.getByRole('button', { name: /^Release ₹42,000/ }));
    expect((await screen.findAllByText('Say why the hold ends, in a few words.')).length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: /Reason for release/ })).toHaveFocus();
    expect(screen.queryByText(/Paid in the next monthly run/)).not.toBeInTheDocument();
    // Positive: a reason and the off-cycle route (one Segment).
    await ue.type(screen.getByRole('textbox', { name: /Reason for release/ }), 'Clearance done today');
    await ue.click(screen.getByRole('radio', { name: 'Off-cycle payment now' }));
    await ue.click(screen.getByRole('button', { name: /^Release ₹42,000/ }));
    expect(screen.getByText(/Paid now by an off-cycle bank file/)).toBeInTheDocument();
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Release' }));
    await waitFor(() => expect(live.holds.onRelease).toHaveBeenCalledWith('h1', { reason: 'Clearance done today', route: 'offcycle' }));
    expect((await screen.findAllByText(/released for an off-cycle payment now/)).length).toBeGreaterThan(0);
    await ue.click(screen.getAllByRole('button', { name: 'Hold a salary' })[0]);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Hold salary' }));
    expect(within(d).getAllByText('Choose a reason code.').length).toBeGreaterThan(0);
    expect(live.holds.onAdd).not.toHaveBeenCalled();
  });
});

const queries = (over: Partial<LiveQueries> = {}): LiveQueries => ({
  state: 'ready',
  queries: [...QUERIES, { ...QUERIES[0], id: 'q9', mine: true, employeeId: 'p3' }],
  nameOf,
  me: { id: 'u1', name: 'Meera' },
  today: '2026-10-06',
  status: 'open',
  onStatus: vi.fn(),
  onReply: ok(),
  onClose: ok(),
  onAssign: ok(),
  ...over,
});

describe('Payroll › Payslip queries (PAY-20 live)', () => {
  it('payroll replies and resolves; its own queries are not in the queue', async () => {
    const live = queries();
    render(<QueryQueueScreen live={live} />);
    expect(screen.queryByText('Sridhar Fernandes')).not.toBeInTheDocument();
    await ue.click(screen.getAllByText('Arjun Kulkarni')[0]);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Mark resolved' }));
    expect((await screen.findAllByText('Reply to the employee first, then mark it resolved.')).length).toBeGreaterThan(0);
    expect(live.onClose).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox'), 'HRA follows the new basic from September.');
    await ue.click(within(d).getByRole('button', { name: /^(Comment|Add|Send|Post)/ }));
    await waitFor(() => expect(live.onReply).toHaveBeenCalledWith(QUERIES[0], 'HRA follows the new basic from September.'));
  });

  it('a query with a payroll reply resolves; assign to me sends my id', async () => {
    const live = queries();
    render(<QueryQueueScreen live={live} />);
    await ue.click(screen.getAllByText('Divya Raghunathan')[0]);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Assign to me' }));
    await waitFor(() => expect(live.onAssign).toHaveBeenCalledWith(QUERIES[1], 'u1'));
    await ue.click(within(d).getByRole('button', { name: 'Mark resolved' }));
    await waitFor(() => expect(live.onClose).toHaveBeenCalledWith(QUERIES[1]));
  });

  it('reassign to a named colleague: pressed with nobody chosen it says so (negative), then sends their id (positive)', async () => {
    const onHandlers = vi.fn(async () => [
      { userId: 'u1', name: 'Meera', me: true },
      { userId: 'u2', name: 'Karthik Subramanian', me: false },
    ]);
    const live = queries({ onHandlers, queries: [{ ...QUERIES[0], assigneeUserId: 'u1' }] });
    render(<QueryQueueScreen live={live} />);
    await ue.click(screen.getAllByText('Arjun Kulkarni')[0]);
    const d = screen.getByRole('dialog');
    await waitFor(() => expect(onHandlers).toHaveBeenCalled());
    await ue.click(within(d).getByRole('button', { name: 'Reassign' }));
    expect(within(d).getByText('Choose who to reassign the query to.')).toBeInTheDocument();
    expect(live.onAssign).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: /Reassign to/ }));
    await ue.click(await screen.findByRole('option', { name: 'Karthik Subramanian' }));
    await ue.click(within(d).getByRole('button', { name: 'Reassign' }));
    await waitFor(() => expect(live.onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: QUERIES[0].id }), 'u2'));
    expect((await screen.findAllByText('Query from Arjun Kulkarni reassigned to Karthik Subramanian')).length).toBeGreaterThan(0);
  });

  it('the drawer shows the line amount and its explanation from the API; none for a whole-payslip query', async () => {
    const withLine = { ...QUERIES[0], line: { name: 'House rent allowance', amount: '24200.00', explanation: '40% of basic (non-metro).' } };
    render(<QueryQueueScreen live={queries({ queries: [withLine] })} />);
    await ue.click(screen.getAllByText('Arjun Kulkarni')[0]);
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('₹24,200')).toBeInTheDocument();
    expect(within(d).getByText('40% of basic (non-metro).')).toBeInTheDocument();
  });

  it('the status is one pick-one Segment; an error shows retry', async () => {
    const live = queries();
    const { unmount } = render(<QueryQueueScreen live={live} />);
    await ue.click(screen.getByRole('radio', { name: 'Resolved' }));
    expect(live.onStatus).toHaveBeenCalledWith('closed');
    unmount();
    const onRetry = vi.fn();
    render(<QueryQueueScreen live={queries({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('reply due counts 2 working days, skipping the weekend', () => {
    expect(replyDueIn('2026-10-02T09:00:00Z', '2026-10-02')).toBe(4); // Fri → Tue
    expect(replyDueIn('2026-10-05T09:00:00Z', '2026-10-08')).toBe(-1); // Mon → Wed, a day overdue
  });
});

const recoveries = (over: Partial<LiveRecoveriesData> = {}): LiveRecoveriesData => ({
  orders: { state: 'ready', rows: [{ id: 'c1', employeeId: 'p1', orderRef: 'MC 214/2026', amount: '12000.00', percent: null, priorityDate: '2026-05-12', capTotal: '144000.00', remittedTotal: '36000.00', status: 'active' }], canAdd: true, onAdd: ok() },
  overpayments: { state: 'ready', rows: [{ id: 'r1', employeeId: 'p2', originTaxYear: '2025-26', crossYear: true, amount: '21500.00', recovered: '0.00', balance: '21500.00', instalment: '5375.00', reason: 'Paid after last working day', status: 'proposed' }], canWriteOff: true, onWriteOff: ok() },
  nameOf,
  onSearch: search,
  today: '2026-09-29',
  ...over,
});

describe('Arrears and recoveries › PAY-19 tabs (live)', () => {
  it('court orders list with priority; adding one is refused until the form is right, then sent', async () => {
    const live = recoveries();
    render(<RecoveriesScreen live={live} />);
    expect(screen.getByText('MC 214/2026')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Add court order' })[0]);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add court order' }));
    expect(within(d).getAllByText('Enter the order reference.').length).toBeGreaterThan(0);
    expect(live.orders.onAdd).not.toHaveBeenCalled();
  });

  it('without the key there is no add button; an overpayment write-off needs a reason', async () => {
    const live = recoveries({ tab: 'over' });
    live.orders.canAdd = false;
    render(<RecoveriesScreen live={live} />);
    expect(screen.queryByRole('button', { name: 'Add court order' })).not.toBeInTheDocument();
    expect(screen.getByText(/Earlier tax year 2025-26/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Write off' }));
    await ue.click(screen.getByRole('button', { name: 'Approve write-off' }));
    expect(await screen.findByText('Say why, in a few words.')).toBeInTheDocument();
    expect(live.overpayments.onWriteOff).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Below the cost of recovery');
    await ue.click(screen.getByRole('button', { name: 'Approve write-off' }));
    await waitFor(() => expect(live.overpayments.onWriteOff).toHaveBeenCalledWith(live.overpayments.rows![0], 'Below the cost of recovery'));
  });
});
