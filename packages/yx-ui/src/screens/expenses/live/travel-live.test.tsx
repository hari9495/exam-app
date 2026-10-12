import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdvanceScreen, AdvancesScreen, TripScreen, TripsScreen, type AdvanceScreenProps, type TripScreenProps } from './travel';
import type { AdvanceDetail, TripDetail } from './types';

// Expenses batch E4 screens (M05-BUILD-DESIGN §19; EXP-04 trip, EXP-05 advance; XP-4.07).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const trip = (o: Partial<TripDetail> = {}): TripDetail => ({
  id: 't1',
  purpose: 'Pune distributor meetings',
  person: 'Ravi Kumar',
  fromOn: '2026-10-05',
  toOn: '2026-10-09',
  currency: 'INR',
  estimate: '20000.00',
  advanceRequested: '10000.00',
  bookingNeeded: true,
  status: 'approved',
  version: 4,
  decisionNote: null,
  legs: [{ seq: 1, fromCity: 'Mumbai', toCity: 'Pune', country: 'IN', departOn: '2026-10-05', mode: 'road', stayNights: 2 }],
  bookings: [{ id: 'b1', kind: 'hotel', title: 'Pune hotel', amount: '3000.00', paidBy: 'company', provider: null, providerRef: null, hasFile: false }],
  budget: { estimate: '20000.00', companyPaid: '3000.00', claimed: '7000.00', used: '10000.00', left: '10000.00' },
  claims: [],
  advance: { id: 'a1', kind: 'trip', tripId: 't1', purpose: 'Pune distributor meetings', currency: 'INR', requested: '10000.00', amount: '10000.00', changeReason: null, status: 'paid', paidOn: '2026-10-04', settleBy: '2026-10-24', balance: '3000.00', overdue: false, version: 3 },
  route: null,
  can: { edit: false, submit: false, cancel: false, book: true, partner: false, decide: null, claim: true },
  ...o,
});
const tripProps = (t: TripDetail, o: Partial<TripScreenProps> = {}): TripScreenProps => ({ state: 'ready', trip: t, onBack: vi.fn(), onSubmit: ok, onCancel: ok, onDecide: vi.fn(ok), onAddBooking: vi.fn(ok), onPartnerBook: ok, onRemoveBooking: ok, onOpenBooking: ok, onNewClaim: vi.fn(ok), onOpenClaim: vi.fn(), onOpenAdvance: vi.fn(), ...o });
const advance = (o: Partial<AdvanceDetail> = {}): AdvanceDetail => ({
  id: 'a2',
  kind: 'imprest',
  tripId: null,
  purpose: 'Site petty cash',
  currency: 'INR',
  requested: '5000.00',
  amount: '5000.00',
  changeReason: null,
  status: 'requested',
  paidOn: null,
  settleBy: null,
  balance: '0.00',
  overdue: false,
  version: 1,
  person: 'Ravi Kumar',
  ledger: [],
  can: { changeAmount: true, decide: 'task9', pay: false, recordReturn: false, claim: false },
  ...o,
});
const advanceProps = (a: AdvanceDetail, o: Partial<AdvanceScreenProps> = {}): AdvanceScreenProps => ({ state: 'ready', advance: a, today: '2026-10-12', onBack: vi.fn(), onChangeAmount: vi.fn(ok), onDecide: vi.fn(ok), onPay: vi.fn(ok), onReturn: vi.fn(ok), onNewClaim: ok, onOpenTrip: vi.fn(), onOpenClaim: vi.fn(), ...o });

describe('Trips (EXP-04)', () => {
  it('the request needs a purpose, dates, legs and an estimate before it goes; who books is a pick-one control', async () => {
    const onRequest = vi.fn(ok);
    render(<TripsScreen state="ready" mine={[]} approvals={null} desk={null} today="2026-10-12" onRequest={onRequest} onOpen={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Request a trip' }));
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(onRequest).not.toHaveBeenCalled();
    expect(screen.getAllByText('Say what the trip is for.').length).toBeGreaterThan(0);
    expect(screen.getByRole('radiogroup', { name: 'Who books tickets and hotel' })).toBeTruthy();
  });

  it('the traveller sees what is left on the advance and can add a claim to the trip', async () => {
    const p = tripProps(trip());
    render(<TripScreen {...p} />);
    expect(screen.getAllByText('₹3,000.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/return ₹3,000.00 by bank by 24 Oct 2026/)).toBeTruthy();
    expect(screen.getByText('Company (not paid back)')).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Add a claim to this trip' }));
    expect(p.onNewClaim).toHaveBeenCalled();
  });

  it('the travel desk sees bookings, not the money', () => {
    render(<TripScreen {...tripProps(trip({ budget: null, advance: null }))} />);
    expect(screen.queryByText('Settlement')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a claim to this trip' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a booking' })).toBeTruthy();
  });

  it('a booking needs what and how much; who paid is a pick-one control', async () => {
    const p = tripProps(trip());
    render(<TripScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Add a booking' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Add booking' }));
    expect(p.onAddBooking).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /What was booked/ }), 'Mumbai to Pune cab');
    await ue.type(within(dialog).getByRole('textbox', { name: /Amount/ }), '800');
    await ue.click(within(dialog).getByRole('radio', { name: 'The company paid' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Add booking' }));
    expect(p.onAddBooking).toHaveBeenCalledWith({ kind: 'ticket', title: 'Mumbai to Pune cab', amount: '800', paidBy: 'company', file: null });
  });

  it('the approver approves through their task', async () => {
    const p = tripProps(trip({ status: 'submitted', can: { edit: false, submit: false, cancel: false, book: false, partner: false, decide: 'task1', claim: false } }));
    render(<TripScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(p.onDecide).toHaveBeenCalledWith('task1', 'approve', '');
  });
});

describe('Advances (EXP-05)', () => {
  it('the list shows the open balance and flags an overdue one', () => {
    render(<AdvancesScreen state="ready" mine={[{ ...advance({ status: 'paid', paidOn: '2026-09-01', settleBy: '2026-10-01', balance: '4000.00', overdue: true }) }]} approvals={null} payout={null} onRequest={ok} onOpen={vi.fn()} />);
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹4,000.00').length).toBeGreaterThan(0);
  });

  it('the approver lowers the amount only with a reason', async () => {
    const p = advanceProps(advance());
    render(<AdvanceScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Approve less' }));
    const dialog = screen.getByRole('dialog');
    const amount = within(dialog).getByRole('textbox', { name: /Approve/ });
    await ue.clear(amount);
    await ue.type(amount, '4000');
    expect((within(dialog).getByRole('button', { name: 'Save amount' }) as HTMLButtonElement).disabled).toBe(true);
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Two weeks is enough');
    await ue.click(within(dialog).getByRole('button', { name: 'Save amount' }));
    expect(p.onChangeAmount).toHaveBeenCalledWith('4000.00', 'Two weeks is enough');
  });

  it('finance records a return no larger than the open balance', async () => {
    const p = advanceProps(advance({ status: 'paid', paidOn: '2026-10-01', balance: '3000.00', ledger: [{ id: 'p', on: '2026-10-01', kind: 'paid', text: 'Advance paid', amount: '5000.00', claimId: null }], can: { changeAmount: false, decide: null, pay: false, recordReturn: true, claim: false } }));
    render(<AdvanceScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Record a return' }));
    const dialog = screen.getByRole('dialog');
    const amount = within(dialog).getByRole('textbox', { name: /Amount returned/ });
    await ue.clear(amount);
    await ue.type(amount, '3500');
    await ue.type(within(dialog).getByRole('textbox', { name: /Bank reference/ }), 'UTR-9');
    expect((within(dialog).getByRole('button', { name: 'Record return' }) as HTMLButtonElement).disabled).toBe(true);
    await ue.clear(amount);
    await ue.type(amount, '3000');
    await ue.click(within(dialog).getByRole('button', { name: 'Record return' }));
    expect(p.onReturn).toHaveBeenCalledWith('3000.00', '2026-10-12', 'UTR-9');
  });
});
