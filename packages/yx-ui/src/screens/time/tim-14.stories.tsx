import type { Meta, StoryObj } from '@storybook/react-vite';
import { DevicesScreen } from './ops';

const meta: Meta<typeof DevicesScreen> = { title: 'Screens/Time/TIM-14 · Devices and kiosks', component: DevicesScreen, render: (args) => <DevicesScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof DevicesScreen>;

export const Kiosks: S = { name: 'HR · kiosks and last seen' };
export const Binds: S = { name: 'New phone requests', args: { tab: 'binds' } };
export const Phones: S = { name: 'Employee phones', args: { tab: 'phones' } };
export const SignOut: S = { name: 'Remote sign-out', args: { tab: 'phones', signOut: true } };
// DeviceNotApproved (2 Nov 2026): computers for web clock-in are asked for and approved in the same lists.
export const ComputerRequest: S = { name: 'Computers · new computer request', args: { tab: 'binds', computers: true } };
export const ComputerRemove: S = { name: "Computers · remove a computer's approval", args: { tab: 'phones', removeComputer: true } };
export const SystemAdmin: S = { name: 'System Admin', args: { persona: 'sa' } };
export const Training: S = { name: 'Training · sessions', args: { tab: 'training' } };
export const TrainingAdd: S = { name: 'Training · add a session', args: { tab: 'training', training: { form: 'new' } } };
export const TrainingEdit: S = { name: 'Training · change a session (chosen people)', args: { tab: 'training', training: { form: 'tr2' } } };
export const TrainingCancel: S = { name: 'Training · cancel a session', args: { tab: 'training', training: { cancel: 'tr1' } } };
export const TrainingEmpty: S = { name: 'Training · none yet', args: { tab: 'training', state: 'empty' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
