import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyShiftsPhone, RosterScreen } from './roster';

const meta: Meta<typeof RosterScreen> = { title: 'Screens/Time/TIM-05 · Roster', component: RosterScreen, render: (args) => <RosterScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof RosterScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Draft: S = { name: 'Manager · draft with conflicts' };
export const Published: S = { name: 'Published', args: { status: 'published' } };
export const CopyWeek: S = { name: 'Copy last week', args: { dialog: 'copy', partial: true } };
export const Swap: S = { name: 'Swap shifts', args: { dialog: 'swap' } };
export const Notice: S = { name: 'Publish · changes inside the notice', args: { dialog: 'notice' } };
export const Hr: S = { name: 'HR', args: { persona: 'hr' } };
export const Staff: S = { name: 'Employee · read-only', args: { persona: 'emp', status: 'published' } };
export const Empty: S = { name: 'Empty week', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
export const Phone: StoryObj<typeof MyShiftsPhone> = { name: 'Phone · my shifts', render: () => <MyShiftsPhone />, ...phone };
// Batch A B6 (answer 2316): tick people, then change their shift, weekly off or penalty policy from a date.
export const BulkBar: S = { name: 'Manager · people ticked (bulk bar)', args: { ticked: ['p1', 'p2', 'p3'] } };
export const BulkShift: S = { name: 'Manager · bulk change shift', args: { ticked: ['p1', 'p2', 'p3'], bulk: 'shift' } };
export const BulkWeeklyOff: S = { name: 'Manager · bulk change weekly off', args: { ticked: ['p1', 'p2'], bulk: 'weekly_off' } };
export const BulkPenalty: S = { name: 'HR · bulk change penalty policy', args: { persona: 'hr', ticked: ['p1', 'p2', 'p3', 'p4'], bulk: 'penalty' } };
