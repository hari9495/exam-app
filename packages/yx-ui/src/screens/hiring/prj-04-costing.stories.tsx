import type { Meta, StoryObj } from '@storybook/react-vite';
import { CostingMarginScreen, type CostRow } from './projects';

const meta: Meta = { title: 'Screens/Projects/PRJ-04 · Project costing and margin', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ROWS: CostRow[] = [
  { code: 'NRP-WEB', name: 'Store locator and loyalty web app', client: 'Nilgiri Retail', pm: 'Karthik Subramanian', revenue: 9_52_000, cost: 5_84_000, expenses: 10_860, provisional: true, peopleInMonth: 6 },
  { code: 'CLL-WMS', name: 'Warehouse app integration', client: 'Coromandel Logistics', pm: 'Joseph Mathew', revenue: 12_00_000, cost: 4_12_000, expenses: 0, provisional: true, peopleInMonth: 4 },
  { code: 'DPH-QMS', name: 'Quality management support', client: 'Deccan Pharma', pm: 'Divya Raghunathan', revenue: 1_20_000, cost: 72_000, expenses: 0, provisional: true, peopleInMonth: 1 },
  { code: 'INT-ERP', name: 'Plant ERP upgrade', client: 'Internal', pm: 'Prakash Menon', revenue: 0, cost: 3_10_000, expenses: 18_500, provisional: true, peopleInMonth: 5 },
];
const AUG: CostRow[] = ROWS.map((r) => ({ ...r, provisional: false, restated: r.code === 'NRP-WEB' ? -9_600 : undefined, revenue: r.code === 'NRP-WEB' ? r.revenue - 9_600 : r.revenue }));

export const Finance: S = { name: 'Finance · provisional September', render: () => <CostingMarginScreen rows={ROWS} persona="finance" /> };
export const Pm: S = { name: 'PM · one-person project cost hidden', render: () => <CostingMarginScreen rows={ROWS} persona="pm" /> };
export const Final: S = { name: 'Finance · August final, NRP-WEB restated', render: () => <CostingMarginScreen rows={AUG} persona="finance" period="Aug 2026" /> };
export const Empty: S = { name: 'Empty', render: () => <CostingMarginScreen rows={[]} persona="finance" /> };
export const Loading: S = { name: 'Loading', render: () => <CostingMarginScreen rows={ROWS} persona="finance" loading /> };
