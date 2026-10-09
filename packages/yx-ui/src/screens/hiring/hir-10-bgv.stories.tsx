import type { Meta, StoryObj } from '@storybook/react-vite';
import { BgvTrackerScreen } from './hiring-offers';
import { BGV_ROWS } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-10 · BGV tracker', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Hr: S = { name: 'HR · partner checks', render: () => <BgvTrackerScreen rows={BGV_ROWS} /> };
export const Discrepancy: S = { name: 'Discrepancy · never auto-withdrawn', render: () => <BgvTrackerScreen rows={BGV_ROWS} openId="g1" /> };
export const ConsentPending: S = { name: 'Consent pending', render: () => <BgvTrackerScreen rows={BGV_ROWS} openId="g3" persona="recruiter" /> };
export const Manual: S = { name: 'Manual tracking · no add-on', render: () => <BgvTrackerScreen rows={BGV_ROWS.map((r) => ({ ...r, mode: 'Manual' as const }))} addOn={false} /> };
export const Empty: S = { name: 'Empty', render: () => <BgvTrackerScreen rows={[]} /> };
export const Loading: S = { name: 'Loading', render: () => <BgvTrackerScreen rows={[]} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <BgvTrackerScreen rows={[]} state="error" /> };
