import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConnectivityPanelScreen } from '../delivery';

const meta: Meta<typeof ConnectivityPanelScreen> = { title: 'Screens/Proctoring/PRC-10 · Connectivity panel', component: ConnectivityPanelScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ConnectivityPanelScreen>;

export const OverCap: S = { name: 'Over the 10-minute cap: approve extra' };
export const WithinCap: S = { name: 'Within cap: credited automatically', args: { lostSeconds: 140 } };
export const Confirm: S = { name: 'Approve extra time confirmation', args: { confirmOpen: true } };
export const Approved: S = { args: { approved: true } };
