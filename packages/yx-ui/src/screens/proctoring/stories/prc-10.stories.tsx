import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConnectivityPanelScreen } from '../delivery';
import { liveConnectivity } from '../before-test-live-samples';

const meta: Meta<typeof ConnectivityPanelScreen> = { title: 'Screens/Proctoring/PRC-10 · Connectivity panel', component: ConnectivityPanelScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ConnectivityPanelScreen>;

export const OverCap: S = { name: 'Over the 10-minute cap: approve extra' };
export const WithinCap: S = { name: 'Within cap: credited automatically', args: { lostSeconds: 140 } };
export const Confirm: S = { name: 'Approve extra time confirmation', args: { confirmOpen: true } };
export const Approved: S = { args: { approved: true } };

// AS-4b (answer 2011): the company's time lost above the cap, waiting for a person.
export const LiveOverCap: S = { name: 'Company: over the cap, test running', render: () => <ConnectivityPanelScreen live={liveConnectivity()} /> };
export const LiveEnded: S = { name: 'Company: test ended, decline only', render: () => <ConnectivityPanelScreen live={liveConnectivity({ rows: [liveConnectivity().rows[1]!] })} /> };
export const LiveNothing: S = { name: 'Company: nothing waiting', render: () => <ConnectivityPanelScreen live={liveConnectivity({ rows: [] })} /> };
