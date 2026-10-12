import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdvanceScreen, AdvancesScreen, TripScreen, TripsScreen, type AdvanceScreenProps, type TripScreenProps } from './travel';
import type { AdvanceDetail, AdvanceSummary, TripDetail, TripSummary } from './types';

// Trips and advances, wired (batch E4; EXP-04, EXP-05). In the affordance guard set ('screens-expenses-live').
const meta: Meta = { title: 'Screens/Expenses/Live · Trips and advances', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const TODAY = '2026-10-12';
const summary = (o: Partial<TripSummary> = {}): TripSummary => ({ id: 't1', purpose: 'Pune distributor meetings', person: 'Ravi Kumar', fromOn: '2026-10-05', toOn: '2026-10-09', currency: 'INR', estimate: '20000.00', advanceRequested: '10000.00', bookingNeeded: true, status: 'approved', version: 4, ...o });
const adv = (o: Partial<AdvanceSummary> = {}): AdvanceSummary => ({ id: 'a1', kind: 'trip', tripId: 't1', purpose: 'Pune distributor meetings', currency: 'INR', requested: '10000.00', amount: '10000.00', changeReason: null, status: 'paid', paidOn: '2026-10-04', settleBy: '2026-10-24', balance: '3000.00', overdue: false, version: 3, ...o });
const trip = (o: Partial<TripDetail> = {}): TripDetail => ({
  ...summary(),
  decisionNote: null,
  legs: [
    { seq: 1, fromCity: 'Mumbai', toCity: 'Pune', country: 'IN', departOn: '2026-10-05', mode: 'road', stayNights: 2 },
    { seq: 2, fromCity: 'Pune', toCity: 'Mumbai', country: 'IN', departOn: '2026-10-09', mode: 'rail', stayNights: 0 },
  ],
  bookings: [
    { id: 'b1', kind: 'hotel', title: 'Pune hotel, 2 nights', amount: '3000.00', paidBy: 'company', provider: null, providerRef: null, hasFile: true },
    { id: 'b2', kind: 'ticket', title: 'Pune → Mumbai (rail)', amount: '1200.00', paidBy: 'company', provider: 'dev-fake', providerRef: 'FAKE-20261009-PUNMUM', hasFile: false },
  ],
  budget: { estimate: '20000.00', companyPaid: '4200.00', claimed: '7000.00', used: '11200.00', left: '8800.00' },
  claims: [{ id: 'c1', title: 'Pune trip', status: 'approved', claimedTotal: '7000.00', approvedTotal: '7000.00', advanceAdjusted: '7000.00' }],
  advance: adv(),
  route: { status: 'approved', currentStep: 2, steps: [{ name: 'Manager', state: 'approved' }, { name: 'Travel desk', state: 'approved' }] },
  can: { edit: false, submit: false, cancel: false, book: true, partner: true, decide: null, claim: true },
  ...o,
});
const tripProps = (t: TripDetail): TripScreenProps => ({ state: 'ready', trip: t, onBack: () => {}, onSubmit: ok, onCancel: ok, onDecide: ok, onAddBooking: ok, onPartnerBook: ok, onRemoveBooking: ok, onOpenBooking: ok, onNewClaim: ok, onOpenClaim: () => {}, onOpenAdvance: () => {} });
const advance = (o: Partial<AdvanceDetail> = {}): AdvanceDetail => ({
  ...adv(),
  person: 'Ravi Kumar',
  ledger: [
    { id: 'p', on: '2026-10-04', kind: 'paid', text: 'Advance paid', amount: '10000.00', claimId: null },
    { id: 's1', on: '2026-10-11', kind: 'claim', text: 'Settled by claim: Pune trip', amount: '-7000.00', claimId: 'c1' },
  ],
  can: { changeAmount: false, decide: null, pay: false, recordReturn: false, claim: false },
  ...o,
});
const advanceProps = (a: AdvanceDetail): AdvanceScreenProps => ({ state: 'ready', advance: a, today: TODAY, onBack: () => {}, onChangeAmount: ok, onDecide: ok, onPay: ok, onReturn: ok, onNewClaim: ok, onOpenTrip: () => {}, onOpenClaim: () => {} });

export const Trips: S = { render: () => <TripsScreen state="ready" mine={[summary(), summary({ id: 't2', purpose: 'Delhi trade fair', status: 'submitted', fromOn: '2026-11-02', toOn: '2026-11-06' })]} approvals={[summary({ id: 't3', person: 'Sita Rao', status: 'submitted' })]} desk={null} today={TODAY} onRequest={ok} onOpen={() => {}} /> };
export const TripToReturn: S = { name: 'Trip · advance left to return', render: () => <TripScreen {...tripProps(trip())} /> };
export const TripForApprover: S = { name: 'Trip · waiting for the manager', render: () => <TripScreen {...tripProps(trip({ status: 'submitted', advance: null, claims: [], route: { status: 'pending', currentStep: 1, steps: [{ name: 'Manager', state: 'open' }, { name: 'Travel desk', state: 'pending' }] }, can: { edit: false, submit: false, cancel: false, book: false, partner: false, decide: 'task1', claim: false } }))} /> };
export const TripForTravelDesk: S = { name: 'Trip · travel desk (no money shown)', render: () => <TripScreen {...tripProps(trip({ person: 'Ravi Kumar', budget: null, advance: null, claims: [] }))} /> };
export const Advances: S = { render: () => <AdvancesScreen state="ready" mine={[adv(), adv({ id: 'a2', kind: 'imprest', tripId: null, purpose: 'Site petty cash', status: 'paid', settleBy: '2026-10-01', balance: '4000.00', overdue: true })]} approvals={null} payout={[adv({ id: 'a3', person: 'Sita Rao', status: 'approved', balance: '0.00', paidOn: null })]} onRequest={ok} onOpen={() => {}} /> };
export const AdvanceLedger: S = { name: 'Advance · ledger', render: () => <AdvanceScreen {...advanceProps(advance())} /> };
export const AdvanceOverdue: S = { name: 'Advance · overdue, finance view', render: () => <AdvanceScreen {...advanceProps(advance({ kind: 'imprest', tripId: null, settleBy: '2026-10-01', overdue: true, can: { changeAmount: false, decide: null, pay: false, recordReturn: true, claim: false } }))} /> };
export const AdvanceToApprove: S = { name: 'Advance · approver may lower it', render: () => <AdvanceScreen {...advanceProps(advance({ kind: 'imprest', tripId: null, status: 'requested', amount: '4000.00', requested: '5000.00', changeReason: 'Two weeks is enough', paidOn: null, settleBy: null, balance: '0.00', ledger: [], can: { changeAmount: true, decide: 'task9', pay: false, recordReturn: false, claim: false } }))} /> };
