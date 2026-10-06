import type { Meta, StoryObj } from '@storybook/react-vite';
import { PeriodsScreen } from './requests';

const meta: Meta<typeof PeriodsScreen> = { title: 'Screens/Time/TIM-11 · Periods', component: PeriodsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PeriodsScreen>;

export const Hr: S = { name: 'HR · month cards' };
export const PayrollAdmin: S = { name: 'Payroll Admin', args: { persona: 'pa' } };
export const Checklist: S = { name: 'Pre-lock checklist · blocked', args: { openId: 'sep' } };
export const NotEnded: S = { name: 'October · month not over', args: { openId: 'oct' } };
export const Send: S = { name: 'HR · send for payroll approval (1 Oct)', args: { openId: 'sep', dialog: 'send', after: true } };
export const Lock: S = { name: 'Payroll Admin · lock with typed confirmation (1 Oct)', args: { persona: 'pa', openId: 'sep', dialog: 'lock', after: true } };
export const Summary: S = { name: 'Lock summary · filed month', args: { openId: 'aug' } };
// A filed month can't be reopened: its Lock summary says why, so there is no separate refused story.
export const ReopenAllowed: S = { name: 'Reopen request · September locked 1 Oct', args: { openId: 'sep', dialog: 'reopen', reopenable: true, after: true } };
