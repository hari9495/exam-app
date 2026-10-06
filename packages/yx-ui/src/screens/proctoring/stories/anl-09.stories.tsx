import type { Meta, StoryObj } from '@storybook/react-vite';
import { AskAnalyticsScreen } from '../analytics';

const meta: Meta<typeof AskAnalyticsScreen> = { title: 'Screens/Analytics/ANL-09 · Ask analytics', component: AskAnalyticsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof AskAnalyticsScreen>;

export const Answer: S = { name: 'Governed answer with definition' };
export const Refused: S = { name: 'Refused: no salary access', args: { variant: 'refused' } };
export const Generating: S = { args: { variant: 'generating' } };
export const Empty: S = { name: 'First question', args: { variant: 'empty' } };
