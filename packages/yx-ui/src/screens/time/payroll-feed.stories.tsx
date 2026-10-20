import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayrollFeedScreen } from './payroll-feed';

// Designed for the live Payroll feed page (it had no design): what payroll reads for each person and month.
const meta: Meta<typeof PayrollFeedScreen> = { title: 'Screens/Time/Extra · Payroll feed', component: PayrollFeedScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayrollFeedScreen>;

export const Frozen: S = { name: 'Frozen at the lock' };
export const Preview: S = { name: 'Preview · month open', args: { frozen: false } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
