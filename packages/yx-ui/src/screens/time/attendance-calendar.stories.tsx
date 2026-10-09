import type { Meta, StoryObj } from '@storybook/react-vite';
import { AttendanceCalendarPhone, AttendanceCalendarScreen } from './attendance';

// Founder extra 2 · Attendance calendar (employee month view + manager view of one person).
const meta: Meta<typeof AttendanceCalendarScreen> = { title: 'Screens/Time/Extra · Attendance calendar', component: AttendanceCalendarScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof AttendanceCalendarScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Employee: S = { name: 'Employee · September' };
export const DayOpen: S = { name: 'Day card open · missing check-out', args: { openDay: 10 } };
export const DayOpenPending: S = { name: 'Day card open · regularisation pending', args: { openDay: 22 } };
export const Locked: S = { name: 'Locked period · August', args: { defaultMonth: 'aug' } };
export const LockedDay: S = { name: 'Locked period · day card', args: { defaultMonth: 'aug', openDay: 21 } };
export const Manager: S = { name: 'Manager · one person', args: { persona: 'mgr' } };
export const ManagerDay: S = { name: 'Manager · day card', args: { persona: 'mgr', openDay: 3 } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
export const Phone: StoryObj<typeof AttendanceCalendarPhone> = { name: 'Phone', render: () => <AttendanceCalendarPhone />, ...phone };
export const PhoneDay: StoryObj<typeof AttendanceCalendarPhone> = { name: 'Phone · day sheet', render: () => <AttendanceCalendarPhone openDay={10} />, ...phone };
export const PhoneLocked: StoryObj<typeof AttendanceCalendarPhone> = { name: 'Phone · locked month', render: () => <AttendanceCalendarPhone defaultMonth="aug" />, ...phone };
