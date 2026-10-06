import type { Meta, StoryObj } from '@storybook/react-vite';
import { TestCentresScreen } from '../delivery';

const meta: Meta<typeof TestCentresScreen> = { title: 'Screens/Proctoring/Extra · Test centre console', component: TestCentresScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TestCentresScreen>;

export const Syncing: S = { name: 'Session running, syncing' };
export const Offline: S = { name: 'Centre offline, sealed locally', args: { syncState: 'offline' } };
export const Verified: S = { name: 'Full sync verified', args: { syncState: 'verified' } };
