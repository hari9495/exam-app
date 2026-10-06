import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccommodationQueueScreen } from '../delivery';
import { ACCOMMODATIONS } from '../proctoring-data';

const meta: Meta<typeof AccommodationQueueScreen> = { title: 'Screens/Proctoring/PRC-11 · Accommodation review queue', component: AccommodationQueueScreen, parameters: { layout: 'fullscreen' }, args: { rows: ACCOMMODATIONS } };
export default meta;
type S = StoryObj<typeof AccommodationQueueScreen>;

export const Review: S = { name: 'Review a request' };
export const Queue: S = { args: { defaultOpenId: null } };
export const HrLd: S = { name: 'HR / L&D (employee test-takers)', args: { persona: 'HR / L&D', defaultOpenId: null } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };
