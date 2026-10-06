import type { Meta, StoryObj } from '@storybook/react-vite';
import { TestBuilderScreen } from '../bank-tests';

const meta: Meta<typeof TestBuilderScreen> = { title: 'Screens/Proctoring/PRC-04 · Test builder', component: TestBuilderScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TestBuilderScreen>;

export const Blueprint: S = { name: 'Blueprint grid' };
export const BelowPoolDepth: S = { name: 'Blueprint below pool depth', args: { shortCells: true } };
export const Template: S = { name: 'Template library', args: { step: 'template' } };
export const BuildFromJd: S = { name: 'Build from job description', args: { step: 'template', jd: true } };
export const Adaptive: S = { name: 'Adaptive config', args: { mode: 'Adaptive' } };
export const AdaptiveSimulated: S = { name: 'Adaptive simulation results', args: { mode: 'Adaptive', simulated: true } };
export const Timing: S = { name: 'Timing and navigation', args: { step: 'timing' } };
export const Proctoring: S = { name: 'Proctoring mode', args: { step: 'proctoring' } };
export const ReviewBlocked: S = { name: 'Pre-publish checklist, blocked', args: { step: 'review', shortCells: true } };
export const ReviewReady: S = { name: 'Pre-publish checklist, ready', args: { step: 'review' } };
