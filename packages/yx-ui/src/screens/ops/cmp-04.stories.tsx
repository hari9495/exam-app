import type { Meta, StoryObj } from '@storybook/react-vite';
import { TdsChallanScreen } from './compliance';
import { CHALLAN, HUB_ITEMS } from './compliance-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Compliance/CMP-04 · TDS challan sheet', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const OnTime: S = { name: 'Pre-filled, on time', render: () => <TdsChallanScreen challan={CHALLAN} today={TODAY} items={HUB_ITEMS} /> };
export const LateInterest: S = { name: 'Late deposit · interest computed', render: () => <TdsChallanScreen challan={CHALLAN} today={TODAY} depositOn={new Date(2026, 10, 12)} items={HUB_ITEMS} /> };
export const EditedNeedsReason: S = { name: 'Amount changed · reason required', render: () => <TdsChallanScreen challan={CHALLAN} today={TODAY} edited items={HUB_ITEMS} /> };
export const Consultants: S = { name: 'Consultant section 194J', render: () => <TdsChallanScreen challan={{ ...CHALLAN, section: '194J(b) consultants · 2025 Act cross-walk', tds: 59530 }} today={TODAY} items={HUB_ITEMS} /> };
