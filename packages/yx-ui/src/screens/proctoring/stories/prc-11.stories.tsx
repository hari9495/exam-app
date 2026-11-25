import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccommodationQueueScreen } from '../delivery';
import { ACC_DECIDED, liveAccommodations } from '../before-test-live-samples';
import { ACCOMMODATIONS } from '../proctoring-data';

const meta: Meta<typeof AccommodationQueueScreen> = { title: 'Screens/Proctoring/PRC-11 · Accommodation review queue', component: AccommodationQueueScreen, parameters: { layout: 'fullscreen' }, args: { rows: ACCOMMODATIONS } };
export default meta;
type S = StoryObj<typeof AccommodationQueueScreen>;

export const Review: S = { name: 'Review a request' };
export const Queue: S = { args: { defaultOpenId: null } };
export const HrLd: S = { name: 'HR / L&D (employee test-takers)', args: { persona: 'HR / L&D', defaultOpenId: null } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };

// AS-4b (answer 2011): the company's requests, decided item by item.
export const LiveWaiting: S = { name: 'Company: requests waiting', render: () => <AccommodationQueueScreen live={liveAccommodations()} /> };
export const LiveDecided: S = { name: 'Company: decided', render: () => <AccommodationQueueScreen live={liveAccommodations({ tab: 'decided', rows: ACC_DECIDED })} /> };
