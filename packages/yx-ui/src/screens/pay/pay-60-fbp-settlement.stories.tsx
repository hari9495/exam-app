import type { Meta, StoryObj } from '@storybook/react-vite';
import { FlexSettlementScreen } from './flex-benefits';

const meta: Meta<typeof FlexSettlementScreen> = { title: 'Screens/Pay/PAY-60 · Flexible benefit settlement', component: FlexSettlementScreen, render: (args) => <FlexSettlementScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof FlexSettlementScreen>;

export const BeforeMarch: S = { name: 'Year end · before March' };
export const March: S = { name: 'Year end · March (open)', args: { open: true } };
export const Leavers: S = { name: 'Leavers · exit settlement', args: { view: 'leavers' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const LoadError: S = { name: 'Error · retry', args: { state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access' } };
