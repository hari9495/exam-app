import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, play, press, type } from '../_kit/story-play';
import { PayPeriodsScreen, ReopenRequestsScreen, SAMPLE_PERIODS, SAMPLE_REQUEST_MINE, SAMPLE_REQUESTS } from './payroll-records';

// PAY-49 · Pay periods (founder decision 3, 29 Oct 2026): the stage of every month per legal entity, its history, asking
// to reopen a locked month, and the two-approval reopen (maker is not checker, typed phrase, second sign-in step).
const meta: Meta<typeof PayPeriodsScreen> = { title: 'Screens/Pay/PAY-49 · Pay periods', component: PayPeriodsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayPeriodsScreen>;

const why = type(/^Why/, 'A late overtime claim of Anil Kumar was approved after the lock');

export const Periods: S = { name: 'Pay periods · stage per legal entity' };
export const ReadOnly: S = { name: 'Pay periods · cannot ask to reopen', args: { data: { ...SAMPLE_PERIODS, entities: SAMPLE_PERIODS.entities.map((e) => ({ ...e, canRequestReopen: false })) } } };
export const History: S = { name: 'A month’s history and corrections (drawer)', args: { open: 'history' } };
export const AskReopen: S = { name: 'Ask to reopen · reason (drawer)', args: { open: 'ask' } };
export const AskReopenMissing: S = { name: 'Ask to reopen · sent with no reason', args: { open: 'ask' }, play: play(press('Send for approval')) };
export const AskReopenRefused: S = { name: 'Ask to reopen · the server refuses', args: { open: 'ask', onAskReopen: fails('September payslips are issued, so the month cannot be reopened. Pay it as a correction.') }, play: play(why, press('Send for approval')) };
export const Empty: S = { name: 'Empty · no legal entity in scope', args: { data: { ...SAMPLE_PERIODS, entities: [] } } };
export const Loading: S = { name: 'Loading', args: { state: 'loading', data: null } };
export const LoadError: S = { name: 'Error', args: { state: 'error', data: null } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access', data: null } };

type R = StoryObj<typeof ReopenRequestsScreen>;
const requests = (args: Parameters<typeof ReopenRequestsScreen>[0] = {}) => <ReopenRequestsScreen {...args} />;
export const Requests: R = { name: 'Reopen requests · one waiting for me', render: () => requests() };
export const RequestMine: R = { name: 'Reopen requests · asked by me (two others approve)', render: () => requests({ data: [SAMPLE_REQUEST_MINE, SAMPLE_REQUESTS[1]!] }) };
export const Approve: R = { name: 'Approve a reopen · type the phrase (sheet)', render: () => requests({ open: 'approve' }) };
export const ApproveMissing: R = { name: 'Approve a reopen · pressed without the phrase', render: () => requests({ open: 'approve' }), play: play(press('Approve')) };
export const ApproveRefused: R = { name: 'Approve a reopen · second sign-in step timed out', render: () => requests({ open: 'approve', onDecide: fails('Confirm it is you first: the second sign-in step timed out.') }), play: play(type(/^Type REOPEN/, 'REOPEN KFPL-TN 2026-09'), press('Approve')) };
export const TurnDown: R = { name: 'Turn down a reopen · reason (drawer)', render: () => requests({ open: 'decline' }) };
export const TurnDownMissing: R = { name: 'Turn down a reopen · pressed with no reason', render: () => requests({ open: 'decline' }), play: play(press('Turn down')) };
export const RequestsEmpty: R = { name: 'Reopen requests · empty', render: () => requests({ data: [] }) };
export const RequestsLoading: R = { name: 'Reopen requests · loading', render: () => requests({ state: 'loading', data: null }) };
export const RequestsError: R = { name: 'Reopen requests · error', render: () => requests({ state: 'error', data: null }) };
export const RequestsNoAccess: R = { name: 'Reopen requests · no access', render: () => requests({ state: 'no-access', data: null }) };
