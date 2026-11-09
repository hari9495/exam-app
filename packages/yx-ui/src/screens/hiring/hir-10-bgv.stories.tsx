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
// HIR-10 build (founder decision 3, manual BGV): recording a result, a person deciding a discrepancy, adding a check.
const MANUAL = BGV_ROWS.map((r) => ({ ...r, mode: 'Manual' as const, package: 'Manual · 5 checks' }));
export const RecordResult: S = { name: 'Manual · record a result (who, day, evidence)', render: () => <BgvTrackerScreen rows={MANUAL} addOn={false} openId="g4" recordOpen="Address" /> };
export const Decide: S = { name: 'Manual · a person decides the discrepancy', render: () => <BgvTrackerScreen rows={MANUAL} addOn={false} openId="g1" decideOpen /> };
export const AddCheck: S = { name: 'Manual · add a check', render: () => <BgvTrackerScreen rows={MANUAL} addOn={false} openId="g2" addOpen /> };
