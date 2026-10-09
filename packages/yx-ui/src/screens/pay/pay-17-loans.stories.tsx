import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoansScreen } from './admin-tax-loans';

const meta: Meta<typeof LoansScreen> = { title: 'Screens/Pay/PAY-17 · Loans and advances', component: LoansScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LoansScreen>;

export const List: S = { name: 'List · filters' };
export const Record: S = { name: 'Loan record · EMI schedule', args: { openId: 'l1' } };
export const Paused: S = { name: 'EMIs paused', args: { openId: 'l3' } };
export const PauseDialog: S = { name: 'Pause EMIs with reason', args: { openId: 'l1', action: 'pause' } };
export const PreClose: S = { name: 'Pre-closure', args: { openId: 'l6', action: 'preclose' } };
export const Empty: S = { name: 'Empty', args: { rows: [] } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const LoadError: S = { name: 'Error · retry', args: { state: 'error' } };
