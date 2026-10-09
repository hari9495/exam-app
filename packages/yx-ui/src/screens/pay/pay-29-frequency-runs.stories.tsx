import type { Meta, StoryObj } from '@storybook/react-vite';
import { FrequencyRunsScreen } from './payroll-run';

const meta: Meta<typeof FrequencyRunsScreen> = { title: 'Screens/Pay/PAY-29 · Weekly and fortnightly runs', component: FrequencyRunsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof FrequencyRunsScreen>;

export const WeeklyList: S = { name: 'Run list · weekly' };
export const FortnightlyList: S = { name: 'Run list · fortnightly', args: { frequency: 'Fortnightly' } };
export const WeeklyRun: S = { name: 'Weekly run · payslips step', args: { view: 'run' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
