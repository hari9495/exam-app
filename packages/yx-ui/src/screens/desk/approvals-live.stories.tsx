import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, never, ok, play, press, pressFirst, tab, type } from '../_kit/story-play';
import { ApprovalsScreen, type ApprovalsScreenProps } from './approvals';
import { ActionLinkScreen, ChannelLinksCard } from './esm2';
import type { ApprovalHistory, ApprovalTask, Delegation } from './esm-types';
import type { ActionLinkView, ChannelLinkView } from './esm2-types';

// Approvals (SD-2.05), the page behind an approval card in Teams, Slack or a phone push (SD-2.06), and "Approve from
// chat apps": the same components the live pages render, with Kaveri Foods data (3 Nov 2026).
const meta: Meta = { title: 'Screens/Service desk/Live · Approvals, approval link and chat apps', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ Approvals
const TASKS: ApprovalTask[] = [
  {
    taskId: 't1', requestId: 'r1', type: 'Leave', title: 'Casual leave, 6–7 Nov (2 days)', requester: 'Kavya Reddy', raisedBy: null, onBehalfOf: null,
    summary: [{ label: 'From', value: '2026-11-06' }, { label: 'To', value: '2026-11-07' }, { label: 'Balance after', value: '7 days' }],
    step: { index: 1, of: 1, name: 'Your manager', need: 1, approvers: 1 }, dueAt: '2026-11-05T12:30:00Z', submittedAt: '2026-11-03T04:10:00Z',
  },
  {
    taskId: 't2', requestId: 'r2', type: 'Service request', title: 'New laptop for Arjun Kulkarni', requester: 'Arjun Kulkarni', raisedBy: 'Fatima Shaikh', onBehalfOf: 'Lakshmi Venkatesan',
    summary: [{ label: 'Item', value: 'Dell Latitude 5440' }, { label: 'Needed by', value: '2026-11-22' }, { label: 'Cost centre', value: 'Quality, Hosur' }],
    step: { index: 2, of: 2, name: 'Finance', need: 1, approvers: 2 }, dueAt: '2026-11-01T12:30:00Z', submittedAt: '2026-10-29T06:00:00Z',
  },
  {
    taskId: 't3', requestId: 'r3', type: 'Payroll', title: 'Reopen September payroll, Kaveri Foods Pvt Ltd (Tamil Nadu)', requester: 'Suresh Pillai', raisedBy: null, onBehalfOf: null,
    summary: [{ label: 'Why', value: 'A late overtime claim of Anil Kumar was approved after the lock' }],
    step: { index: 1, of: 1, name: 'Payroll approver', need: 1, approvers: 1 }, dueAt: null, submittedAt: '2026-11-02T09:00:00Z', decideAt: '/yx/pay/reopen-requests/r3',
  },
];
const HISTORY: ApprovalHistory = {
  decided: [
    { requestId: 'h1', title: 'Casual leave, 27 Oct (1 day), Rekha Balan', type: 'Leave', decision: 'approved', at: '2026-10-24T05:30:00Z', requestStatus: 'approved' },
    { requestId: 'h2', title: 'Taxi claim, ₹1,840, Anil Kumar', type: 'Expense', decision: 'rejected', at: '2026-10-22T11:00:00Z', requestStatus: 'rejected' },
  ],
  sent: [{ requestId: 'h3', title: 'Monitor for my desk', type: 'Service request', status: 'pending', submittedAt: '2026-10-30T07:00:00Z', decidedAt: null }],
};
const DELEGATIONS: Delegation[] = [
  { id: 'dl1', mine: true, person: 'Divya Raghunathan', delegate: 'Meena Raghavan', startsOn: '2026-11-10', endsOn: '2026-11-14', source: 'manual' },
  { id: 'dl2', mine: false, person: 'Lakshmi Venkatesan', delegate: 'Divya Raghunathan', startsOn: '2026-11-03', endsOn: '2026-11-07', source: 'leave' },
];
const PEOPLE = [{ id: 'u-meena', label: 'Meena Raghavan', detail: 'Finance Controller' }, { id: 'u-suresh', label: 'Suresh Pillai', detail: 'Plant HR Manager' }];
const approvals = (over: Partial<ApprovalsScreenProps> = {}) => (
  <ApprovalsScreen state="ready" tasks={TASKS} history={HISTORY} delegations={DELEGATIONS} timeZone="Asia/Kolkata" onDecide={ok} onDelegate={ok} onRevoke={ok} onFindPeople={async () => PEOPLE} {...over} />
);
export const Waiting: S = { name: 'Approvals · waiting for me (one late, one on its own page)', render: () => approvals() };
export const Focused: S = { name: 'Approvals · opened from a notice (request marked)', render: () => approvals({ focusRequestId: 'r2' }) };
export const Approving: S = { name: 'Approvals · approving', render: () => approvals({ onDecide: never }), play: play(pressFirst('Approve')) };
export const ApproveFailed: S = { name: 'Approvals · approve refused', render: () => approvals({ onDecide: fails('Someone else on this step already decided it.') }), play: play(pressFirst('Approve')) };
export const Reject: S = { name: 'Do not approve · open', render: () => approvals(), play: play(pressFirst('Do not approve')) };
export const RejectMissing: S = { name: 'Do not approve · pressed with no reason', render: () => approvals(), play: play(pressFirst('Do not approve'), press('Do not approve')) };
export const RejectFilled: S = { name: 'Do not approve · reason given', render: () => approvals(), play: play(pressFirst('Do not approve'), type(/^Reason/, 'The team is short that week; please move it to 13–14 Nov.')) };
export const History: S = { name: 'Approvals · history', render: () => approvals(), play: play(tab('History')) };
export const HistoryEmpty: S = { name: 'Approvals · no history yet', render: () => approvals({ history: { decided: [], sent: [] } }), play: play(tab('History')) };
export const Away: S = { name: 'When I am away · set and coming up', render: () => approvals(), play: play(tab('When I am away')) };
export const AwayMissing: S = { name: 'When I am away · Save pressed with no one chosen', render: () => approvals({ delegations: [] }), play: play(tab('When I am away'), press('Save')) };
export const Empty: S = { name: 'Approvals · nothing waits', render: () => approvals({ tasks: [] }) };
export const Loading: S = { name: 'Approvals · loading', render: () => approvals({ state: 'loading', tasks: [] }) };
export const LoadFailed: S = { name: 'Approvals · could not load', render: () => approvals({ state: 'error', tasks: [], onRetry: () => undefined }) };

// ------------------------------------------------------------------ Approve from chat apps (on the Approvals page)
const LINKS: ChannelLinkView = { typedLinksAllowed: true, links: [{ id: 'cl1', provider: 'teams', label: 'divya@kaverifoods.in', createdAt: '2026-10-20T05:00:00Z' }] };
const SENT = [{ provider: 'teams', at: '2026-11-03T04:12:00Z', title: 'Casual leave, 6–7 Nov (2 days)', url: '/yx/act/demo-token' }];
const card = (links: ChannelLinkView, onAdd: () => Promise<unknown> = ok) => (
  <div className="yx-auth__page">
    <ChannelLinksCard links={links} sent={SENT} onAdd={onAdd} onRemove={ok} />
  </div>
);
export const ChatApps: S = { name: 'Chat apps · Teams linked, a card sent (demo)', render: () => card(LINKS) };
export const ChatAppsNone: S = { name: 'Chat apps · none linked (production)', render: () => card({ typedLinksAllowed: false, links: [] }) };
export const ChatAppsMissing: S = { name: 'Chat apps · Link pressed with no account', render: () => card(LINKS), play: play(press('Link')) };
export const ChatAppsFailed: S = { name: 'Chat apps · linking refused', render: () => card(LINKS, fails('This Slack account is already linked to someone else.')), play: play(type(/^Your account in that app/, 'U04KAVERI22'), press('Link')) };

// ------------------------------------------------------------------ The page behind an approval card (/yx/act/[token])
const VIEW: ActionLinkView = { state: 'open', title: 'Casual leave, 6–7 Nov (2 days)', summary: [{ label: 'Who', value: 'Kavya Reddy' }, { label: 'From', value: '6 Nov 2026' }, { label: 'To', value: '7 Nov 2026' }], expiresAt: '2026-11-05T12:30:00Z' };
export const LinkOpen: S = { name: 'Approval link · open', render: () => <ActionLinkScreen view={VIEW} error={null} done={null} onDecide={ok} onSignIn={() => undefined} /> };
export const LinkRejectMissing: S = { name: 'Approval link · not approving, sent with no reason', render: () => <ActionLinkScreen view={VIEW} error={null} done={null} onDecide={ok} onSignIn={() => undefined} />, play: play(press('Not approve'), press('Send: not approved')) };
export const LinkFailed: S = { name: 'Approval link · the server refuses', render: () => <ActionLinkScreen view={VIEW} error={null} done={null} onDecide={fails('This link was already used. Open your approvals in YukthiX.')} onSignIn={() => undefined} />, play: play(press('Approve')) };
export const LinkDone: S = { name: 'Approval link · done', render: () => <ActionLinkScreen view={VIEW} error={null} done="You approved it. You can close this page." onDecide={ok} onSignIn={() => undefined} /> };
export const LinkSignIn: S = { name: 'Approval link · sensitive, sign in to decide', render: () => <ActionLinkScreen view={{ ...VIEW, state: 'sign_in', title: 'An approval is waiting for you', summary: [] }} error={null} done={null} onDecide={ok} onSignIn={() => undefined} /> };
export const LinkClosed: S = { name: 'Approval link · already closed', render: () => <ActionLinkScreen view={{ ...VIEW, state: 'closed' }} error={null} done={null} onDecide={ok} onSignIn={() => undefined} /> };
export const LinkInvalid: S = { name: 'Approval link · not valid', render: () => <ActionLinkScreen view={null} error="This link is not valid. Open your approvals in YukthiX." done={null} onDecide={ok} onSignIn={() => undefined} /> };
export const LinkLoading: S = { name: 'Approval link · loading', render: () => <ActionLinkScreen view={null} error={null} done={null} onDecide={ok} onSignIn={() => undefined} /> };
