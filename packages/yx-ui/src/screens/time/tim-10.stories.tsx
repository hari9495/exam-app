import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeviceBackfillWizard } from './requests';

const meta: Meta<typeof DeviceBackfillWizard> = { title: 'Screens/Time/TIM-10 · Device backfill correction', component: DeviceBackfillWizard, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof DeviceBackfillWizard>;

export const Batch: S = { name: 'Step 1 · batch' };
export const Preview: S = { name: 'Step 2 · preview', args: { current: 'preview' } };
export const Reason: S = { name: 'Step 3 · reason', args: { current: 'reason' } };
export const Review: S = { name: 'Review', args: { current: 'review' } };
export const Done: S = { name: 'Applied', args: { done: true } };
