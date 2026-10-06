import type { Meta, StoryObj } from '@storybook/react-vite';
import { AutoRosterScreen } from './roster';

const meta: Meta<typeof AutoRosterScreen> = { title: 'Screens/Time/TIM-34 · Auto-roster', component: AutoRosterScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof AutoRosterScreen>;

export const Draft: S = { name: 'Coverage and draft' };
export const Demand: S = { name: 'Demand editor', args: { step: 'demand' } };
export const Running: S = { name: 'Generating', args: { step: 'running' } };
export const Explain: S = { name: 'Unfilled slot explained', args: { explainOpen: true } };
export const Approved: S = { name: 'Approved · publish', args: { approved: true } };
