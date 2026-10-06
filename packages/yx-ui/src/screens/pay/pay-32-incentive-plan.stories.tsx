import type { Meta, StoryObj } from '@storybook/react-vite';
import { IncentivePlanScreen } from './special-pay';

const meta: Meta<typeof IncentivePlanScreen> = { title: 'Screens/Pay/PAY-32 · Incentive plan builder', component: IncentivePlanScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IncentivePlanScreen>;

export const Draft: S = { name: 'Draft · tiers, accelerator, cap, clawback' };
export const Overlap: S = { name: 'Validation error · overlapping tiers', args: { variant: 'overlap' } };
export const Published: S = { name: 'Published', args: { variant: 'published' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
