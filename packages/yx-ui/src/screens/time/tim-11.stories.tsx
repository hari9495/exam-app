import type { Meta, StoryObj } from '@storybook/react-vite';
import { PeriodsScreen } from './requests';

const meta: Meta<typeof PeriodsScreen> = { title: 'Screens/Time/TIM-11 · Periods', component: PeriodsScreen, render: (args) => <PeriodsScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PeriodsScreen>;

export const Hr: S = { name: 'HR · month cards' };
export const PayrollAdmin: S = { name: 'Payroll Admin', args: { persona: 'pa' } };
export const Checklist: S = { name: 'Pre-lock checklist · blocked', args: { openId: 'sep' } };
export const NotEnded: S = { name: 'October · month not over', args: { openId: 'oct' } };
export const Send: S = { name: 'HR · send for payroll approval (1 Oct)', args: { openId: 'sep', dialog: 'send', after: true } };
export const Lock: S = { name: 'Payroll Admin · approve lock (1 Oct)', args: { persona: 'pa', openId: 'sep', dialog: 'lock', after: true } };
export const Summary: S = { name: 'Lock summary · filed month', args: { openId: 'aug' } };
// A filed month can't be reopened: its Lock summary says why, so there is no separate refused story.
export const ReopenAllowed: S = { name: 'Reopen request · September locked 1 Oct', args: { openId: 'sep', dialog: 'reopen', reopenable: true, after: true } };
// Founder decision 7a (29 Oct 2026): HR opens a month it froze again, with a reason and the authenticator code.
export const OpenAgain: S = { name: 'HR · open a frozen month again (1 Oct)', args: { openId: 'sep', dialog: 'open_again', after: true } };
// Batch C item 6 (answers 2505, 2506): waive late-mark penalties before the lock; the mark stays, shown as waived.
export const LateMarks: S = { name: 'Late marks · waive before the lock', args: { late: 'list' } };
export const LateWaive: S = { name: 'Late marks · waive 2 with one reason', args: { late: 'waive' } };
export const LateLocked: S = { name: 'Late marks · locked month (read only)', args: { late: 'locked' } };
