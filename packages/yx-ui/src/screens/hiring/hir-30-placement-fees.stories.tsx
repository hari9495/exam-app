import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlacementFeeSettingsScreen } from './hiring-staffing';

const meta: Meta = { title: 'Screens/Hiring/HIR-30 · Placement fee and replacement guarantee', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const TAPER = [
  { fromMonth: 0, pct: 8.33 },
  { fromMonth: 3, pct: 6 },
  { fromMonth: 6, pct: 4 },
  { fromMonth: 12, pct: 0 },
];
const base = { client: 'Nilgiri Retail Pvt Ltd', taper: TAPER, exampleCtc: 18_00_000 };

export const Percent: S = { name: 'Account manager · % of CTC, replacement', render: () => <PlacementFeeSettingsScreen {...base} model={{ kind: 'percent', pct: 8.33 }} guaranteeDays={90} remedy="replace" exampleLeftAfter={40} /> };
export const FixedRefund: S = {
  name: 'Finance · fixed fee, pro-rated credit',
  render: () => <PlacementFeeSettingsScreen {...base} model={{ kind: 'fixed', amount: 1_50_000 }} guaranteeDays={90} remedy="refund" exampleLeftAfter={30} persona="finance" />,
};
export const OutsideGuarantee: S = { name: 'Left after the guarantee period', render: () => <PlacementFeeSettingsScreen {...base} model={{ kind: 'percent', pct: 8.33 }} guaranteeDays={60} remedy="refund" exampleLeftAfter={75} /> };
