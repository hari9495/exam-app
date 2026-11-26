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
// Answer 2754: first set-up with no leave types offers the starter gallery (also under Leave types › Add starter leave types).
const STARTERS = [
  { key: 'casual', code: 'CL', name: 'Casual leave', kind: 'casual', summary: '12 days a year, credited monthly, lapses at year end', added: false },
  { key: 'sick', code: 'SL', name: 'Sick leave', kind: 'sick', summary: '12 days a year, credited monthly, no notice', added: false },
  { key: 'earned', code: 'EL', name: 'Earned leave', kind: 'earned', summary: '15 days a year, credited monthly, carry forward up to 30', added: true },
  { key: 'maternity', code: 'ML', name: 'Maternity leave', kind: 'maternity', summary: '26 weeks, paid in full (Maternity Benefit Act 1961)', added: false },
  { key: 'paternity', code: 'PL', name: 'Paternity leave', kind: 'paternity', summary: '5 days for each child', added: false },
  { key: 'comp_off', code: 'CO', name: 'Comp-off', kind: 'comp_off', summary: 'Days earned by working a weekly off or holiday', added: false },
  { key: 'lwp', code: 'LWP', name: 'Leave without pay', kind: 'lop', summary: 'Unpaid, no balance', added: false },
];
export const StarterGallery: S = {
  name: 'No leave types yet · starter gallery',
  render: () => (
    <LeavePoliciesScreen
      live={{ state: 'ready', data: { ...TIME_SETUP, types: [], policies: [], starters: STARTERS }, onCreatePolicy: async () => ({}), onAddVersion: async () => ({}), onAssign: async () => ({}), onRemoveAssignment: async () => ({}), onSaveOrder: async () => ({}), onOpenType: () => undefined, onAddStarter: async () => ({}) }}
    />
  ),
};
