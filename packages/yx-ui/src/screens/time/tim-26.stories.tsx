import type { Meta, StoryObj } from '@storybook/react-vite';
import { HolidayCalendarsScreen } from './leave-admin';

const meta: Meta<typeof HolidayCalendarsScreen> = { title: 'Screens/Time/TIM-26 · Holiday calendars', component: HolidayCalendarsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof HolidayCalendarsScreen>;

export const Chennai: S = { name: 'Chennai office · rules' };
export const Clone: S = { name: 'Clone to next year', args: { loc: 'blr', dialog: 'clone' } };
export const Template: S = { name: 'Start from state template', args: { loc: 'mdu', dialog: 'template' } };
export const NoCalendar: S = { name: 'Location without a calendar', args: { loc: 'mdu' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
