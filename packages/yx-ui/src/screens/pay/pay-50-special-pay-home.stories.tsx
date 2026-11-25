import type { Meta, StoryObj } from '@storybook/react-vite';
import { SpecialPayHomeScreen } from './special-pay';

const meta: Meta<typeof SpecialPayHomeScreen> = { title: 'Screens/Pay/PAY-50 · Special pay home', component: SpecialPayHomeScreen, render: (args) => <SpecialPayHomeScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof SpecialPayHomeScreen>;

export const Ready: S = { name: 'Sent to payroll · special pay types' };
export const LayOff: S = { name: 'Lay-off days · drawer open', args: { drawer: 'layoff' } };
export const Vrs: S = { name: 'Pay VRS · exemption worked out', args: { drawer: 'vrs' } };
export const Empty: S = { name: 'Empty · nothing sent this month', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access' } };
