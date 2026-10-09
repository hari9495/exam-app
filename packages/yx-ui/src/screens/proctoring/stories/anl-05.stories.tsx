import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReportBuilderScreen } from '../analytics';

const meta: Meta<typeof ReportBuilderScreen> = { title: 'Screens/Analytics/ANL-05 · Report builder', component: ReportBuilderScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ReportBuilderScreen>;

export const Grouped: S = { name: 'Grouped by department, locked columns' };
export const WithChart: S = { name: 'Chart on', args: { chartOn: true } };
export const Ungrouped: S = { args: { grouped: false } };
export const Empty: S = { name: 'No rows match', args: { empty: true } };
