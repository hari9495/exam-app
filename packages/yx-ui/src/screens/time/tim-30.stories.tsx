import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveReportsScreen } from './ops';

const meta: Meta<typeof LeaveReportsScreen> = { title: 'Screens/Time/TIM-30 · Leave reports', component: LeaveReportsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeaveReportsScreen>;

export const Balances: S = { name: 'Balances' };
export const Taken: S = { name: 'Leave taken', args: { report: 'taken' } };
export const Lop: S = { name: 'Unpaid leave (LOP) to payroll', args: { report: 'lop' } };
export const Liability: S = { name: 'Payroll · liability', args: { persona: 'fin' } };
export const Negative: S = { name: 'Negative balances', args: { report: 'negative' } };
export const Ledger: S = { name: 'Ledger', args: { report: 'ledger' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
