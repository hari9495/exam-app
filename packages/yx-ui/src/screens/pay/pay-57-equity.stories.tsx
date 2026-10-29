import type { Meta, StoryObj } from '@storybook/react-vite';
import { EquityScreen } from './equity';

const meta: Meta<typeof EquityScreen> = { title: 'Screens/Pay/PAY-57 · Equity', component: EquityScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof EquityScreen>;

export const Grants: S = { name: 'Grants · vesting and exercises' };
export const Plans: S = { name: 'Plans · pools and cap table', args: { tab: 'plans' } };
export const Valuations: S = { name: 'Valuations', args: { tab: 'valuations' } };
export const AddPlan: S = { name: 'Add a plan', args: { tab: 'plans', dialog: 'plan' } };
export const AddValuation: S = { name: 'Add a valuation', args: { tab: 'valuations', dialog: 'valuation' } };
export const MakeGrant: S = { name: 'Make a grant', args: { dialog: 'grant' } };
export const ConfirmVesting: S = { name: 'Confirm milestone vesting', args: { dialog: 'confirm' } };
export const PriceReceived: S = { name: 'Exercise price received', args: { dialog: 'paid' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const LoadError: S = { name: 'Error · retry', args: { state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access' } };
