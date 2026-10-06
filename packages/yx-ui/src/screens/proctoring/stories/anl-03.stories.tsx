import type { Meta, StoryObj } from '@storybook/react-vite';
import { DashboardBuilderScreen } from '../analytics';

const meta: Meta<typeof DashboardBuilderScreen> = { title: 'Screens/Analytics/ANL-03 · Dashboard builder', component: DashboardBuilderScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof DashboardBuilderScreen>;

export const PickMetric: S = { name: 'Widget wizard 1: metric', args: { step: 'metric' } };
export const LockedMetric: S = { name: 'Widget wizard 1: salary metrics locked', args: { step: 'metric', noSalaryAccess: true } };
export const PickDimension: S = { name: 'Widget wizard 2: dimension', args: { step: 'dimension' } };
export const PickPeriod: S = { name: 'Widget wizard 3: period', args: { step: 'period' } };
export const PickChart: S = { name: 'Widget wizard 4: chart' };
export const Grid: S = { name: 'Editing grid', args: { wizard: false } };
export const Share: S = { name: 'Share dialog', args: { wizard: false, share: true } };
