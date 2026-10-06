import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyShiftsPhone, RosterScreen } from './roster';

const meta: Meta<typeof RosterScreen> = { title: 'Screens/Time/TIM-05 · Roster', component: RosterScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof RosterScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Draft: S = { name: 'Manager · draft with conflicts' };
export const Published: S = { name: 'Published', args: { status: 'published' } };
export const CopyWeek: S = { name: 'Copy last week', args: { dialog: 'copy', partial: true } };
export const Swap: S = { name: 'Swap shifts', args: { dialog: 'swap' } };
export const Hr: S = { name: 'HR', args: { persona: 'hr' } };
export const Staff: S = { name: 'Employee · read-only', args: { persona: 'emp', status: 'published' } };
export const Empty: S = { name: 'Empty week', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
export const Phone: StoryObj<typeof MyShiftsPhone> = { name: 'Phone · my shifts', render: () => <MyShiftsPhone />, ...phone };
