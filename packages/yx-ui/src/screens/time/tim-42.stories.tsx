import type { Meta, StoryObj } from '@storybook/react-vite';
import { HolidayFeedScreen } from './leave-admin';

const meta: Meta<typeof HolidayFeedScreen> = { title: 'Screens/Time/TIM-42 · Holiday feed settings', component: HolidayFeedScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof HolidayFeedScreen>;

export const Settings: S = { name: 'Subscriptions' };
export const Review: S = { name: 'Review before publish', args: { view: 'review' } };
export const Off: S = { name: 'Feeds off', args: { view: 'off' } };
