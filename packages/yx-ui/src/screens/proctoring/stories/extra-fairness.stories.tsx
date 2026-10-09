import type { Meta, StoryObj } from '@storybook/react-vite';
import { FairnessScreen } from '../integrity';

const meta: Meta<typeof FairnessScreen> = { title: 'Screens/Proctoring/Extra · Fairness analytics', component: FairnessScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof FairnessScreen>;

export const Finding: S = { name: 'Adverse-impact finding' };
export const NoFinding: S = { name: 'No finding', args: { finding: false } };
export const ValiditySuppressed: S = { name: 'Predictive validity suppressed (small sample)', args: { validitySuppressed: true } };
