import type { Meta, StoryObj } from '@storybook/react-vite';
import { ItemAnalysisScreen } from '../bank-tests';
import { QUESTIONS } from '../proctoring-data';

const meta: Meta<typeof ItemAnalysisScreen> = { title: 'Screens/Proctoring/PRC-05 · Item analysis', component: ItemAnalysisScreen, parameters: { layout: 'fullscreen' }, args: { questions: QUESTIONS } };
export default meta;
type S = StoryObj<typeof ItemAnalysisScreen>;

export const Default: S = {};
export const Provisional: S = { name: 'Provisional (under 200 attempts)', args: { state: 'provisional' } };
export const Loading: S = { args: { state: 'loading' } };
