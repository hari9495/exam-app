import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AdvanceScreen, TripScreen } from './expenses';
import { tripTrail, type LiveAdvance, type LiveAdvances, type LiveTrip, type LiveTrips } from './expenses-travel-live';
import { ADVANCE_DETAIL, OPEN_ADVANCE, TRIP_DETAIL, TRIP_WAITING } from './expenses-live-samples';

// EXP-04 trips and EXP-05 advances live (expenses round 1): the designed screens with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const trips = (over: Partial<LiveTrips> = {}): LiveTrips => ({ view: 'list', state: 'ready', onRetry: vi.fn(), mine: [TRIP_DETAIL], approvals: [TRIP_WAITING], desk: null, today: '2026-09-20', onRequest: vi.fn(async () => ({})), onOpen: vi.fn(), ...over });
const trip = (over: Partial<LiveTrip> = {}): LiveTrip => ({
  view: 'record', state: 'ready', onRetry: vi.fn(), trip: TRIP_DETAIL, today: '2026-09-20', onBack: vi.fn(), onSubmit: vi.fn(async () => ({})), onCancel: vi.fn(async () => ({})), onDecide: vi.fn(async () => ({})),
  onAddBooking: vi.fn(async () => ({})), onPartnerBook: vi.fn(async () => ({})), onRemoveBooking: vi.fn(async () => ({})), onOpenBooking: vi.fn(async () => ({})), onNewClaim: vi.fn(async () => ({})), onOpenClaim: vi.fn(), onOpenAdvance: vi.fn(), ...over,
});
const advances = (over: Partial<LiveAdvances> = {}): LiveAdvances => ({ view: 'list', state: 'ready', onRetry: vi.fn(), mine: [OPEN_ADVANCE], approvals: [], payout: null, onRequest: vi.fn(async () => ({})), onRequestTrip: vi.fn(), onOpen: vi.fn(), ...over });
const advance = (over: Partial<LiveAdvance> = {}): LiveAdvance => ({
  view: 'record', state: 'ready', onRetry: vi.fn(), advance: ADVANCE_DETAIL, today: '2026-09-20', onBack: vi.fn(), onChangeAmount: vi.fn(async () => ({})), onDecide: vi.fn(async () => ({})), onPay: vi.fn(async () => ({})), onReturn: vi.fn(async () => ({})),
  onNewClaim: vi.fn(async () => ({})), onOpenTrip: vi.fn(), onOpenClaim: vi.fn(), ...over,
});

describe('trip timeline rule', () => {
  it('approved, advance paid, travelled and a claim sent: settling is the current step', () => {
    expect(tripTrail(TRIP_DETAIL, '2026-09-20').current).toBe(5);
  });
  it('before the trip ends the traveller has not travelled yet; a rejected trip fails at approval', () => {
    expect(tripTrail(TRIP_DETAIL, '2026-09-15').current).toBe(3);
    const r = tripTrail({ ...TRIP_DETAIL, status: 'rejected', advance: null, claims: [] }, '2026-09-20');
    expect([r.current, r.failed, r.steps[1]!.label]).toEqual([1, true, 'Rejected']);
  });
  it('a trip with no advance does not wait for one', () => {
    expect(tripTrail({ ...TRIP_DETAIL, advance: null, claims: [] }, '2026-09-20').current).toBe(4);
  });
});

describe('EXP-04 trips', () => {
  it('lists my trips and those waiting for me; Open goes to the trip', async () => {
    const p = trips();
    show(<TripScreen live={p} />);
    await ue.click(screen.getByRole('radio', { name: 'Waiting for me (1)' }));
    await ue.click(within(screen.getByRole('row', { name: /Dubai trade show/ })).getByRole('button', { name: 'Open' }));
    expect(p.onOpen).toHaveBeenCalledWith('t0219');
  });
  it('request: pressed too early lists what is missing and sends nothing', async () => {
    const p = trips({ startRequest: true });
    show(<TripScreen live={p} />);
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect((await screen.findAllByText('Say what the trip is for, in at least 3 characters.')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Enter the estimated cost, e.g. 20000.').length).toBeGreaterThan(0);
    expect(p.onRequest).not.toHaveBeenCalled();
  });
  it('a trip shows its settlement: what is left to return and the claims on it', async () => {
    const p = trip();
    show(<TripScreen live={p} />);
    expect(screen.getByText('You return')).toBeInTheDocument();
    expect(screen.getByText(/return ₹3,000.00 by bank transfer by 16 Oct 2026/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add claim to this trip' }));
    expect(p.onNewClaim).toHaveBeenCalled();
  });
  it('the approver approves, and rejecting needs a reason', async () => {
    const p = trip({ trip: { ...TRIP_DETAIL, status: 'submitted', can: { ...TRIP_DETAIL.can, claim: false, book: false, decide: 'task1' } } });
    show(<TripScreen live={p} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(p.onDecide).toHaveBeenCalledWith('task1', 'approve', ''));
    await ue.click(screen.getByRole('button', { name: 'Reject' }));
    await ue.click(screen.getByRole('button', { name: 'Reject trip' }));
    expect(await screen.findByText('Enter a reason of at least 3 characters. The employee sees it.')).toBeInTheDocument();
    expect(p.onDecide).toHaveBeenCalledTimes(1);
  });
  it('the travel desk sees no money', () => {
    show(<TripScreen live={trip({ trip: { ...TRIP_DETAIL, budget: null, claims: [] } })} />);
    expect(screen.getByText('The travel desk books the trip; the money is for the traveller and finance.')).toBeInTheDocument();
    expect(screen.queryByText('₹5,920.00')).toBeNull();
  });
  it('a refused trip page shows no access, never "check your connection"', () => {
    show(<TripScreen live={trip({ state: 'no-access', trip: null })} />);
    expect(screen.getByText(/You don't have access to this trip/)).toBeInTheDocument();
  });
});

describe('EXP-05 advances', () => {
  it('lists my advances with what is open and when to settle', () => {
    show(<AdvanceScreen live={advances()} />);
    expect(screen.getByRole('row', { name: /Mumbai distributor meet \(trip\)/ })).toHaveTextContent('16 Oct 2026');
  });
  it('request: a trip advance goes to the trip request; a standing advance needs amount and purpose', async () => {
    const p = advances();
    show(<AdvanceScreen live={p} />);
    await ue.click(screen.getByRole('button', { name: 'Request an advance' }));
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(await screen.findByText('Enter an amount above 0, e.g. 15000.')).toBeInTheDocument();
    expect(p.onRequest).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '15000');
    await ue.type(screen.getByRole('textbox', { name: /Purpose/ }), 'Hosur site petty cash');
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(p.onRequest).toHaveBeenCalledWith('Hosur site petty cash', '15000'));
  });
  it('overdue: the employee is told what happens, with the company’s instalments', () => {
    show(<AdvanceScreen live={advance()} />);
    expect(screen.getByText('Settlement window ended')).toBeInTheDocument();
    expect(screen.getByText(/recovered from salary in 3 instalments/)).toBeInTheDocument();
  });
  it('finance records a return: too much is refused in the field, the balance goes through', async () => {
    const p = advance({ advance: { ...ADVANCE_DETAIL, can: { ...ADVANCE_DETAIL.can, claim: false, recordReturn: true } } });
    show(<AdvanceScreen live={p} />);
    await ue.click(screen.getByRole('button', { name: 'Record a return' }));
    const amount = screen.getByRole('textbox', { name: /Amount returned/ });
    await ue.clear(amount);
    await ue.type(amount, '9000');
    await ue.type(screen.getByRole('textbox', { name: /Bank reference/ }), 'NEFT-77');
    await ue.click(screen.getByRole('button', { name: 'Record return' }));
    expect(await screen.findByText('Enter at most the open balance, ₹6,600.00.')).toBeInTheDocument();
    expect(p.onReturn).not.toHaveBeenCalled();
    await ue.clear(amount);
    await ue.type(amount, '6600');
    await ue.click(screen.getByRole('button', { name: 'Record return' }));
    await waitFor(() => expect(p.onReturn).toHaveBeenCalledWith('6600', '2026-09-20', 'NEFT-77', undefined));
  });
});
