import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimesheetScreen } from './ops';

const meta: Meta<typeof TimesheetScreen> = { title: 'Screens/Time/TIM-15 · Timesheets', component: TimesheetScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TimesheetScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Draft: S = { name: 'Desk · weekly grid' };
export const Submitted: S = { name: 'Submitted · last week', args: { status: 'submitted' } };
export const SentBack: S = { name: 'Sent back with reason · last week', args: { status: 'sent_back' } };
export const Approved: S = { name: 'Approved · last week', args: { status: 'approved' } };
export const Locked: S = { name: 'Locked · August week', args: { status: 'locked' } };
export const PhoneSentBack: S = { name: 'Phone · sent back, resubmit', args: { layout: 'days', status: 'sent_back' }, ...phone };
export const Phone: S = { name: 'Phone · day list, submit week', args: { layout: 'days' }, ...phone };
