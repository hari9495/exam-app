import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyOvertimeScreen } from './my-overtime';

// Designed for the live My overtime page (it had no design): days to claim and my claims.
const meta: Meta<typeof MyOvertimeScreen> = { title: 'Screens/Time/Extra · My overtime', component: MyOvertimeScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MyOvertimeScreen>;

export const Claims: S = { name: 'Days to claim and my claims' };
export const Claim: S = { name: 'Claim a day', args: { claimOpen: true } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
