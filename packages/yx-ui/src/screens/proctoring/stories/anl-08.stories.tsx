import type { Meta, StoryObj } from '@storybook/react-vite';
import { SchedulesScreen } from '../analytics';

const meta: Meta<typeof SchedulesScreen> = { title: 'Screens/Analytics/ANL-08 · Schedules and export log', component: SchedulesScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof SchedulesScreen>;

export const Schedules: S = {};
export const NewSchedule: S = { name: 'New schedule (secure link for Confidential)', args: { dialog: true } };
export const ExportLog: S = { name: 'Export log', args: { tab: 'exports' } };
export const Auditor: S = { name: 'Auditor: export log only', args: { persona: 'Auditor' } };
