import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeavePoliciesScreen } from './leave-admin';
import { TIME_SETUP } from './live/fixtures';

const meta: Meta<typeof LeavePoliciesScreen> = { title: 'Screens/Time/TIM-28 · Leave policies', component: LeavePoliciesScreen, render: (args) => <LeavePoliciesScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeavePoliciesScreen>;

export const List: S = { name: 'Policies and rules' };
export const Open: S = { name: 'Policy drawer', args: { openId: 'p1' } };
export const BlockDatesAdd: S = { name: 'Company block dates · add', args: { blockDates: 'add' } };
export const BlockDatesNone: S = { name: 'Company block dates · none yet', args: { blockDates: 'empty' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
// HLP-12 founder answer 62: the leave set-up offers "Add injury leave" while the company has no injury leave type.
export const InjuryLeaveMissing: S = {
  name: 'No injury leave type yet · Add injury leave',
  render: () => (
    <LeavePoliciesScreen
      live={{ state: 'ready', data: { ...TIME_SETUP, injuryLeave: { code: 'INJURY', missing: true } }, onCreatePolicy: async () => ({}), onAddVersion: async () => ({}), onAssign: async () => ({}), onRemoveAssignment: async () => ({}), onSaveOrder: async () => ({}), onOpenType: () => undefined, onAddInjuryLeave: async () => ({}) }}
    />
  ),
};
