import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnalyticsHomeScreen } from '../analytics';

const meta: Meta<typeof AnalyticsHomeScreen> = { title: 'Screens/Analytics/ANL-01 · Analytics home', component: AnalyticsHomeScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof AnalyticsHomeScreen>;

export const Default: S = { name: 'Mine, shared, templates, library' };
export const FirstUse: S = { name: 'First use (empty)', args: { firstUse: true } };
