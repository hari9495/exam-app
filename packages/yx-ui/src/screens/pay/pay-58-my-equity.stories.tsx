import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyEquityScreen } from './equity';

const meta: Meta<typeof MyEquityScreen> = { title: 'Screens/Pay/PAY-58 · My equity', component: MyEquityScreen, render: (args) => <MyEquityScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MyEquityScreen>;

export const Grants: S = { name: 'My grants · vesting' };
export const Exercise: S = { name: 'Exercise units', args: { dialog: 'exercise' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const LoadError: S = { name: 'Error · retry', args: { state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access' } };
