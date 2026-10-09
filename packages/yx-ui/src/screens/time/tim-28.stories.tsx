import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeavePoliciesScreen } from './leave-admin';

const meta: Meta<typeof LeavePoliciesScreen> = { title: 'Screens/Time/TIM-28 · Leave policies', component: LeavePoliciesScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeavePoliciesScreen>;

export const List: S = { name: 'Policies and rules' };
export const Open: S = { name: 'Policy drawer', args: { openId: 'p1' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
