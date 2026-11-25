import type { Meta, StoryObj } from '@storybook/react-vite';
import { AttendanceReportsScreen } from './ops';

const meta: Meta<typeof AttendanceReportsScreen> = { title: 'Screens/Time/TIM-16 · Attendance reports', component: AttendanceReportsScreen, render: (args) => <AttendanceReportsScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof AttendanceReportsScreen>;

export const LateEarly: S = { name: 'Late and early' };
export const Overtime: S = { name: 'Overtime', args: { report: 'ot' } };
export const Form25: S = { name: 'Form 25 register', args: { report: 'form25' } };
export const NightRegister: S = { name: 'Women night-shift register', args: { report: 'night' } };
export const August: S = { name: 'August 2026 (locked)', args: { month: 'aug' } };
export const Manager: S = { name: 'Manager · my team', args: { persona: 'manager' } };
export const Empty: S = { name: 'Empty · no rows for these filters', args: { filters: [{ key: 'loc', type: 'multi', values: ['Bengaluru head office'] }, { key: 'dept', type: 'multi', values: ['Operations'] }] } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
// Batch C item 16 (answers 2507, 2508): short hours in the company's bands and frequent breaks; not recorded where clock-in-again is off.
export const ShortHours: S = { name: 'Short hours and breaks', args: { report: 'hours' } };
export const ShortHoursManager: S = { name: 'Short hours and breaks · manager', args: { report: 'hours', persona: 'manager' } };
