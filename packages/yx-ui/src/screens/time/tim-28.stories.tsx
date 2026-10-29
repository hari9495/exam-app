import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeavePoliciesScreen } from './leave-admin';

const meta: Meta<typeof LeavePoliciesScreen> = { title: 'Screens/Time/TIM-28 · Leave policies', component: LeavePoliciesScreen, render: (args) => <LeavePoliciesScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeavePoliciesScreen>;

export const List: S = { name: 'Policies and rules' };
export const Open: S = { name: 'Policy drawer', args: { openId: 'p1' } };
export const BlockDatesAdd: S = { name: 'Company block dates · add', args: { blockDates: 'add' } };
export const BlockDatesNone: S = { name: 'Company block dates · none yet', args: { blockDates: 'empty' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
