import type { Meta, StoryObj } from '@storybook/react-vite';
import { MetricCatalogueScreen } from '../analytics';

const meta: Meta<typeof MetricCatalogueScreen> = { title: 'Screens/Analytics/ANL-07 · Metric catalogue', component: MetricCatalogueScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MetricCatalogueScreen>;

export const Definition: S = { name: 'Definition, owner, changelog' };
export const CalculatedMetric: S = { name: 'Calculated-metric builder', args: { builder: true } };
export const ReadOnly: S = { name: 'All users (read-only)', args: { persona: 'Employee', selected: 'workforce.headcount' } };
