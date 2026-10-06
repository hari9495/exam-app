import type { Meta, StoryObj } from '@storybook/react-vite';
import { CapacityPlannerScreen } from '../delivery';

const meta: Meta<typeof CapacityPlannerScreen> = { title: 'Screens/Proctoring/PRC-09 · Drive capacity planner', component: CapacityPlannerScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof CapacityPlannerScreen>;

export const Draft: S = { name: 'Draft plan, 3 waves' };
export const OverCapacity: S = { name: 'Wave over capacity (blocked)', args: { perWave: 1800 } };
export const Approved: S = { args: { approved: true } };
