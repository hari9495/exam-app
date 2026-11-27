import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, never, ok, play, press, pressFirst, tab, type } from '../_kit/story-play';
import { ApprovalsInboxScreen, type LiveApprovals, type LiveDelegation } from './inbox';
import type { ApprovalRow } from './platform-data';

// PLT-04 as /yx/approvals renders it: the designed inbox with the approvals engine's rows (Kaveri Foods, 3 Nov 2026).
// Still the PLT-04 design (no new UI): the policy column and Send back / Ask / Reassign wait for their backend.
const meta: Meta = { title: 'Screens/Platform/Inbox & requests · PLT-04 with real data', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const today = new Date(2026, 10, 3);
const row = (id: string, o: Partial<ApprovalRow>): ApprovalRow => ({ id, ref: id.toUpperCase().padEnd(8, '0'), type: 'Leave', requester: '', requesterRole: '', summary: '', detail: '', submitted: today, due: null, step: '', lowRisk: true, policy: { ok: true }, status: 'Waiting', context: [], ...o });
const WAITING: ApprovalRow[] = [
  row('t1', { requester: 'Kavya Reddy', summary: 'Casual leave, 6–7 Nov (2 days)', detail: 'Step 1 of 1: Your manager', due: new Date(2026, 10, 5), step: 'Your manager', context: ['From: 6 Nov 2026', 'To: 7 Nov 2026', 'Balance after: 7 days'], timeline: [{ id: 's', label: 'Submitted', status: 'done', approver: 'Kavya Reddy', at: new Date(2026, 10, 3, 9, 40) }, { id: 'c', label: 'Your manager (step 1 of 1)', status: 'current', approver: 'You' }] }),
  row('t4', { requester: 'Rekha Balan', summary: 'Casual leave, 10 Nov (1 day)', detail: 'Step 1 of 1: Your manager', due: new Date(2026, 10, 4), step: 'Your manager', context: ['From: 10 Nov 2026', 'Balance after: 4 days'] }),
  row('t2', { type: 'Service request', requester: 'Arjun Kulkarni', raisedBy: 'Fatima Shaikh', onBehalfOf: 'Lakshmi Venkatesan', summary: 'New laptop for Arjun Kulkarni', detail: 'Step 2 of 2: Finance (1 of 2 approve)', due: new Date(2026, 10, 1), step: 'Finance', context: ['Item: Dell Latitude 5440', 'Needed by: 22 Nov 2026', 'Cost centre: Quality, Hosur'] }),
  row('t3', { type: 'Payroll', requester: 'Suresh Pillai', summary: 'Reopen September payroll, Kaveri Foods Pvt Ltd (Tamil Nadu)', detail: 'Step 1 of 1: Payroll approver', step: 'Payroll approver', lowRisk: false, decideAt: '/yx/pay/reopen-requests/r3', context: ['Why: A late overtime claim of Anil Kumar was approved after the lock'] }),
];
const SENT: ApprovalRow[] = [row('r9', { type: 'Service request', requester: 'You', summary: 'Monitor for my desk', detail: 'Sent 30 Oct 2026', lowRisk: false })];
const TEAM: ApprovalRow[] = [
  row('a1', { requester: 'Rekha Balan', summary: 'Casual leave, 27 Oct (1 day)', detail: 'Approved by you on 24 Oct 2026 (step 1)', status: 'Approved', lowRisk: false }),
  row('a2', { type: 'Expense', requester: 'Anil Kumar', summary: 'Taxi claim, ₹1,840', detail: 'Not approved by Meena Raghavan on 22 Oct 2026 (step 2)', status: 'Rejected', lowRisk: false, context: ['Reason: Use the office cab for airport runs'] }),
];
const DELEGATION: LiveDelegation = { meId: 'me', meName: 'Divya Raghunathan', today, people: [{ id: 'u-meena', name: 'Meena Raghavan' }], onFindPeople: () => undefined, current: null, waiting: 4, onSave: ok, onEnd: ok, delegatedToYou: [], approvalsHref: '#', onDone: () => undefined };
const LIVE: LiveApprovals = { today, onDecide: ok, onBulkApprove: async () => [], delegation: DELEGATION, onDone: () => undefined };
const inbox = (over: Partial<LiveApprovals> = {}, more: Partial<Parameters<typeof ApprovalsInboxScreen>[0]> = {}) => <ApprovalsInboxScreen waiting={WAITING} sent={SENT} history={TEAM} live={{ ...LIVE, ...over }} {...more} />;

export const Waiting: S = { name: 'Waiting for me (one late, one on its own page)', render: () => inbox() };
export const Delegated: S = { name: 'Delegated to me', render: () => inbox({}, { defaultTab: 'delegated' }) };
export const Sent: S = { name: 'Sent by me', render: () => inbox({}, { defaultTab: 'sent' }) };
export const Team: S = { name: 'Team history', render: () => inbox({}, { defaultTab: 'history' }) };
export const Opened: S = { name: 'Opened from a notice (side panel)', render: () => inbox({}, { openId: 't1' }) };
export const OwnPage: S = { name: 'Decided on its own page', render: () => inbox({}, { openId: 't3' }) };
export const Approving: S = { name: 'Approving', render: () => inbox({ onDecide: never }), play: play(pressFirst('Approve')) };
export const ApproveFailed: S = { name: 'Approve refused', render: () => inbox({ onDecide: fails('Someone else on this step already decided it.') }), play: play(pressFirst('Approve')) };
export const RejectMissing: S = { name: 'Do not approve · pressed with no reason', render: () => inbox({}, { openId: 't1', defaultDecision: 'reject' }), play: play(press('Do not approve')) };
export const RejectFilled: S = { name: 'Do not approve · reason given', render: () => inbox({}, { openId: 't1', defaultDecision: 'reject' }), play: play(type(/^Reason/, 'The team is short that week; please move it to 13–14 Nov.')) };
export const Bulk: S = { name: 'Bulk approve 2 leave · confirm', render: () => inbox({}, { defaultSelected: ['t1', 't4'], bulkConfirmOpen: true }) };
export const BulkPartly: S = { name: 'Bulk approve · one refused, said why', render: () => inbox({ onBulkApprove: async () => [{ id: 't4', message: 'This approval is already closed.' }] }, { defaultSelected: ['t1', 't4'], bulkConfirmOpen: true }), play: play(press('Approve 2')) };
export const Away: S = { name: 'When I am away', render: () => inbox(), play: play(press('Set up delegation')) };
export const AwayMissing: S = { name: 'When I am away · Save pressed with no one chosen', render: () => inbox(), play: play(press('Set up delegation'), press('Save delegation')) };
export const Empty: S = { name: 'Nothing waits', render: () => inbox({}, { waiting: [] }) };
export const Loading: S = { name: 'Loading', render: () => inbox({}, { waiting: [], state: 'loading' }) };
export const LoadFailed: S = { name: 'Could not load', render: () => inbox({ onRetry: () => undefined }, { waiting: [], state: 'error' }) };
export const TeamTab: S = { name: 'Team history (tab pressed)', render: () => inbox(), play: play(tab('Team history')) };

// T2-E 49 and 50 (answers 2872, 2873): Asked by (a person, my direct team, my whole team) and Status filters, and
// "Decided by me" with its period (30 days, 3 months, 12 months; decisions for someone else say for whom).
const DECIDED: ApprovalRow[] = [
  row('d1', { requester: 'Rekha Balan', requesterTeam: 'direct', summary: 'Casual leave, 27 Oct (1 day)', detail: 'You approved on 24 Oct 2026', status: 'Approved', requestStatus: 'Approved', lowRisk: false }),
  row('d2', { type: 'Expense', requester: 'Anil Kumar', requesterTeam: 'whole', summary: 'Taxi claim, ₹1,840', detail: 'You did not approve on 22 Oct 2026 · for Meena Raghavan', status: 'Rejected', requestStatus: 'Rejected', onBehalfOf: 'Meena Raghavan', lowRisk: false }),
  row('d3', { requester: 'Kavya Reddy', requesterTeam: 'direct', summary: 'Earned leave, 1–5 Dec (5 days)', detail: 'You sent it back on 20 Oct 2026', status: 'Sent back', requestStatus: 'Waiting', lowRisk: false }),
];
const TEAMED = WAITING.map((w, i) => ({ ...w, requesterTeam: (i === 0 ? 'direct' : i === 1 ? 'whole' : null) as ApprovalRow['requesterTeam'] }));
export const DecidedByMe: S = { name: 'Decided by me · 3 months (T2-E 50)', render: () => inbox({ decidedDays: 90 }, { decided: DECIDED, defaultTab: 'decided' }) };
export const DecidedByMeYear: S = { name: 'Decided by me · 12 months, none (T2-E 50)', render: () => inbox({ decidedDays: 365 }, { decided: [], defaultTab: 'decided' }) };
export const AskedByFilter: S = { name: 'Waiting for me · Asked by filter with my teams (T2-E 49)', render: () => <ApprovalsInboxScreen waiting={TEAMED} sent={SENT} history={TEAM} live={LIVE} decided={DECIDED} /> };
