import type { Meta, StoryObj } from '@storybook/react-vite';
import { MetricExplorerScreen } from '../analytics';

const meta: Meta<typeof MetricExplorerScreen> = { title: 'Screens/Analytics/ANL-04 · Metric explorer', component: MetricExplorerScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MetricExplorerScreen>;

export const Breakdown: S = {};
export const Trend: S = { args: { view: 'trend' } };
export const Table: S = { args: { view: 'table' } };
export const Suppressed: S = { name: 'Small groups suppressed', args: { suppressed: true } };
export const Loading: S = { args: { loading: true } };
