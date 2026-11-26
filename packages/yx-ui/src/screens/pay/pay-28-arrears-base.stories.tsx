import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrearsBaseScreen } from './offcycle';
import { ARREARS_JOBS, RULE_DONE, RULE_OPEN, RULE_READY } from './arrears-changes-fixtures';

const meta: Meta<typeof ArrearsBaseScreen> = { title: 'Screens/Pay/PAY-28 · Arrears base confirmation', component: ArrearsBaseScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ArrearsBaseScreen>;

export const Missing: S = { name: 'Month missing · approval blocked' };
export const Confirmed: S = { name: 'Base confirmed · ready to compute', args: { confirmed: true } };
export const Computed: S = { name: 'Arrears computed · send for approval', args: { confirmed: true, computed: true } };
export const List: S = { name: 'Worksheets · list (the page)', args: { view: 'list' } };
export const ListOpen: S = { name: 'Worksheets · one open, base needed', args: { view: 'list', openId: 'ws-0' } };
export const Empty: S = { name: 'Empty · no worksheets', args: { view: 'list', state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { view: 'list', state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { view: 'list', state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { view: 'list', state: 'no-access' } };

// Enterprise E3 (answers 2651, 2652, 2787): statutory rule changes with their impact, and what triggers drafted.
const none = async () => ({});
const live = { state: 'ready' as const, worksheets: [], recoveries: [], nameOf: () => 'Lakshmi Devi', me: 'u1', can: { approve: true, writeOff: false }, onApprove: none, onCancel: none, onConfirmBase: none, onWriteOff: none, tab: 'changes' as const };
export const RuleChanges: S = { name: 'E3 · Rule changes and triggers', args: { live: { ...live, changes: { proposals: [RULE_OPEN, RULE_READY, RULE_DONE], jobs: ARREARS_JOBS, canDecide: true, onPreview: none, onAccept: none, onDismiss: none } } } };
export const RuleChangesEmpty: S = { name: 'E3 · Rule changes and triggers · nothing yet', args: { live: { ...live, changes: { proposals: [], jobs: [], canDecide: true, onPreview: none, onAccept: none, onDismiss: none } } } };
export const RuleChangesViewOnly: S = { name: 'E3 · Rule changes and triggers · cannot decide', args: { live: { ...live, changes: { proposals: [RULE_OPEN, RULE_READY], jobs: ARREARS_JOBS, canDecide: false, onPreview: none, onAccept: none, onDismiss: none } } } };
