import type { Meta, StoryObj } from '@storybook/react-vite';
import { IntegrityQueueScreen } from '../integrity';
import { INCIDENTS } from '../proctoring-data';

const meta: Meta<typeof IntegrityQueueScreen> = { title: 'Screens/Proctoring/PRC-16 · Integrity review queue', component: IntegrityQueueScreen, parameters: { layout: 'fullscreen' }, args: { incidents: INCIDENTS } };
export default meta;
type S = StoryObj<typeof IntegrityQueueScreen>;

export const Queue: S = { name: 'Queue ordered by score' };
export const ConflictOfInterest: S = { name: 'Reassign blocked: conflict of interest', args: { reassign: true } };
export const Capacity: S = { name: 'Reviewer capacity and SLA', args: { tab: 'capacity' } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };
export const Error: S = { args: { state: 'error' } };
