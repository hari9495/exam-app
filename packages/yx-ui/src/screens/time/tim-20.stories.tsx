import type { Meta, StoryObj } from '@storybook/react-vite';
import { TeamLeaveCalendarPhone, TeamLeaveCalendarScreen } from './leave';

const meta: Meta<typeof TeamLeaveCalendarScreen> = { title: 'Screens/Time/TIM-20 · Team leave calendar', component: TeamLeaveCalendarScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TeamLeaveCalendarScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Manager: S = { name: 'Manager · people × days' };
export const Month: S = { name: 'Month view', args: { view: 'month' } };
export const Hr: S = { name: 'HR · all teams', args: { persona: 'hr' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Phone: StoryObj<typeof TeamLeaveCalendarPhone> = { name: 'Phone', render: () => <TeamLeaveCalendarPhone />, ...phone };
