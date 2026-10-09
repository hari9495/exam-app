import type { Meta, StoryObj } from '@storybook/react-vite';
import { DevicesScreen } from './ops';

const meta: Meta<typeof DevicesScreen> = { title: 'Screens/Time/TIM-14 · Devices and kiosks', component: DevicesScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof DevicesScreen>;

export const Kiosks: S = { name: 'HR · kiosks and last seen' };
export const Binds: S = { name: 'New phone requests', args: { tab: 'binds' } };
export const Phones: S = { name: 'Employee phones', args: { tab: 'phones' } };
export const SignOut: S = { name: 'Remote sign-out', args: { tab: 'phones', signOut: true } };
export const SystemAdmin: S = { name: 'System Admin', args: { persona: 'sa' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
