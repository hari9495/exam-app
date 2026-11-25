import type { ReactElement } from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { MassUpdateDrawer, PositionRecordScreen, PositionsScreen, PositionsSwitchOnScreen, SEAT_LIST, SEAT_OPTIONS, SEAT_RECORD, SEAT_ROWS, SWITCH_ON, SeatChangeDrawer, seatValues, type PositionsScreenProps } from './positions';

const today = new Date(2026, 10, 25);
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const listProps = (over: Partial<PositionsScreenProps> = {}): PositionsScreenProps => ({
  state: 'ready',
  onRetry: vi.fn(),
  data: SEAT_LIST,
  options: SEAT_OPTIONS,
  today,
  onOpen: vi.fn(),
  onSwitchOn: vi.fn(),
  valuesOf: vi.fn(async (id: string) => seatValues(SEAT_ROWS.find((r) => r.id === id)!)),
  onSend: vi.fn(async () => undefined),
  ...over,
});
const cashier = { id: 'p2', code: 'POS-00002', title: 'Cashier', legalEntityId: 'kfpl', values: seatValues(SEAT_ROWS[1]) };

describe('POS-01 positions list', () => {
  it('shows the active seats with headcount, filled and vacant, and opens a seat (positive)', async () => {
    const p = listProps();
    wrap(<PositionsScreen {...p} />);
    expect(screen.getByText('4 seats · 5 headcount · 3 filled · 1 vacant')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Positions' });
    expect(within(table).getByText('Cashier')).toBeInTheDocument();
    expect(within(table).queryByText('Night cashier')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(within(table).getByText('Night cashier')).toBeInTheDocument();
    await userEvent.click(within(table).getByText('POS-00001'));
    expect(p.onOpen).toHaveBeenCalledWith('p1');
  });

  it('off: explains positions and offers the switch-on only to a manager (positive and negative)', async () => {
    const p = listProps({ data: { ...SEAT_LIST, enabled: false, rows: [] } });
    const { unmount } = wrap(<PositionsScreen {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plan the switch-on' }));
    expect(p.onSwitchOn).toHaveBeenCalled();
    unmount();
    wrap(<PositionsScreen {...listProps({ data: { ...SEAT_LIST, enabled: false, canManage: false, rows: [] } })} />);
    expect(screen.queryByRole('button', { name: 'Plan the switch-on' })).not.toBeInTheDocument();
  });

  it('a viewer gets no New seat and no money columns (negative)', () => {
    wrap(<PositionsScreen {...listProps({ data: { ...SEAT_LIST, canManage: false, rows: SEAT_ROWS.map(({ entrySalary: _e, budget: _b, ...r }) => r) } })} />);
    expect(screen.queryByRole('button', { name: 'New seat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Entry salary/ })).not.toBeInTheDocument();
  });
});

describe('POS-04 seat change drawer', () => {
  it('a new seat needs a title and a reason before it is sent (negative)', async () => {
    const onSend = vi.fn(async () => undefined);
    wrap(<SeatChangeDrawer open kind="create" options={SEAT_OPTIONS} today={today} onSend={onSend} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(await screen.findByText('Give the seat a title (2 characters or more).')).toBeInTheDocument();
    expect(screen.getByText('Say why, in 10 characters or more.')).toBeInTheDocument();
  });

  it('freeze sends one item with the reason and closes with a toast (positive)', async () => {
    const onSend = vi.fn(async () => undefined);
    const onClose = vi.fn();
    wrap(<SeatChangeDrawer open kind="freeze" seat={cashier} options={SEAT_OPTIONS} today={today} onSend={onSend} onClose={onClose} />);
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'The counter closes for refit');
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith([{ kind: 'freeze', positionId: 'p2', effectiveOn: '2026-11-25' }], 'The counter closes for refit'));
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText('Sent for approval')).toBeInTheDocument();
  });

  it('shows the server refusal and stays open (negative)', async () => {
    const onClose = vi.fn();
    const refuse = vi.fn(async () => Promise.reject(new Error('Move the people out of POS-00002 before it is eliminated.')));
    wrap(<SeatChangeDrawer open kind="eliminate" seat={cashier} options={SEAT_OPTIONS} today={today} onSend={refuse} onClose={onClose} />);
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'The counter is closing for good');
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(await screen.findByText('Move the people out of POS-00002 before it is eliminated.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mass update previews every seat and sends one change per seat (positive)', async () => {
    const onSend = vi.fn(async () => undefined);
    const seats = SEAT_ROWS.slice(1, 3).map((r) => ({ ...r, values: seatValues(r) }));
    wrap(<MassUpdateDrawer open seats={seats} options={SEAT_OPTIONS} today={today} onSend={onSend} onClose={vi.fn()} />);
    expect(within(screen.getByRole('table', { name: /Preview/ })).getAllByRole('row')).toHaveLength(3);
    await userEvent.click(screen.getByRole('radio', { name: 'Cost centre' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'Stores costs move to one centre');
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    const [items, reason] = onSend.mock.calls[0] as unknown as [{ positionId: string; values: { costCentreId: string | null } }[], string];
    expect(items.map((i) => i.positionId)).toEqual(['p2', 'p3']);
    expect(items.every((i) => i.values.costCentreId === null)).toBe(true);
    expect(reason).toBe('Stores costs move to one centre');
  });
});

describe('POS-02 position record', () => {
  const props = { onRetry: vi.fn(), options: SEAT_OPTIONS, today, onBack: vi.fn(), hrefs: { person: (id: string) => `/p/${id}`, seat: (id: string) => `/s/${id}` }, onSend: vi.fn(async () => undefined), onWithdraw: vi.fn(async () => undefined) };
  it('shows the people in the seat and its history; the requester withdraws a waiting change (positive)', async () => {
    wrap(<PositionRecordScreen state="ready" data={{ ...SEAT_RECORD, changes: [{ ...SEAT_RECORD.changes[0], status: 'submitted' }] }} {...props} />);
    expect(screen.getByRole('link', { name: 'Ravi Kumar' })).toHaveAttribute('href', '/p/e1');
    expect(within(screen.getByRole('table', { name: 'Seat history' })).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('A change to this seat is waiting for approval.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(props.onWithdraw).toHaveBeenCalledWith('b1');
  });
  it('a viewer sees no Change and no entry salary (negative)', () => {
    const { entrySalary: _e, ...current } = SEAT_RECORD.current;
    wrap(<PositionRecordScreen state="ready" data={{ ...SEAT_RECORD, canManage: false, current }} {...props} />);
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByText('Proposed entry salary')).not.toBeInTheDocument();
  });
});

describe('POS-03 switch positions on', () => {
  const base = { onRetry: vi.fn(), onBack: vi.fn() };
  it('sending needs a reason; then the plan is sent (positive and negative)', async () => {
    const onSend = vi.fn(async () => undefined);
    wrap(<PositionsSwitchOnScreen state="ready" data={SWITCH_ON} {...base} onSend={onSend} onApprove={vi.fn()} onDecline={vi.fn()} />);
    expect(within(screen.getByRole('table', { name: 'Seats the plan makes' })).getByText('Ravi Kumar, Meera Nair, Asha Pillai, Imran Shaikh, Kiran Das and 1 more')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'We plan by seats from this year on');
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('We plan by seats from this year on'));
  });
  it('another HR person approves; the sender can only withdraw (positive and negative)', async () => {
    const plan = { batchId: 'b1', effectiveOn: '2026-11-25', reason: 'We plan by seats', mine: false, sentAt: '2026-11-25T09:00:00Z' };
    const onApprove = vi.fn(async () => undefined);
    const { unmount } = wrap(<PositionsSwitchOnScreen state="ready" data={{ ...SWITCH_ON, plan }} {...base} onSend={vi.fn()} onApprove={onApprove} onDecline={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Approve and switch on' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('b1'));
    unmount();
    wrap(<PositionsSwitchOnScreen state="ready" data={{ ...SWITCH_ON, plan: { ...plan, mine: true } }} {...base} onSend={vi.fn()} onApprove={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Approve and switch on' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
  });
});
