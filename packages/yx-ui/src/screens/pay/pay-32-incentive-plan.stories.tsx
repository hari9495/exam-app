import type { Meta, StoryObj } from '@storybook/react-vite';
import { IncentivePlanScreen } from './special-pay';
import { IncentiveResultsSheet } from './special-pay-live';
import type { IncentivePlanView, IncentiveResultRow } from './live/types-5i';

const meta: Meta<typeof IncentivePlanScreen> = { title: 'Screens/Pay/PAY-32 · Incentive plan builder', component: IncentivePlanScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IncentivePlanScreen>;

export const Draft: S = { name: 'Draft · tiers, accelerator, cap, clawback' };
export const Overlap: S = { name: 'Validation error · overlapping tiers', args: { variant: 'overlap' } };
export const Published: S = { name: 'Published', args: { variant: 'published' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };

// Founder answer 7 (2 Nov 2026): the month's results sheet with the part held until the customer pays, and Release.
const PLAN: IncentivePlanView = { id: 'ip-1', name: 'South sales commission', kind: 'sales', metric: 'net sales', targetAmount: '20000.00', tiers: [{ from: 0, multiplier: 1 }, { from: 100, multiplier: 1.5 }], capPercent: '200', clawbackDays: 90, status: 'active', payoutFrequency: 'monthly' };
const NAMES: Record<string, string> = { 'e-1': 'Divya Raghunathan', 'e-2': 'Karthik Iyer', 'e-3': 'Meera Krishnan' };
const ROWS: IncentiveResultRow[] = [
  { id: 'r-1', employeeId: 'e-1', quota: '760000.00', actual: '912000.00', amount: '26000.00', held: '6000.00', heldReason: 'Malgudi Stores has not paid invoice 4471', released: false, workings: { attainment: '120.00' }, posted: true },
  { id: 'r-2', employeeId: 'e-2', quota: '600000.00', actual: '540000.00', amount: '18000.00', held: '0.00', heldReason: null, released: false, workings: { attainment: '90.00' }, posted: true },
  { id: 'r-3', employeeId: 'e-3', quota: '500000.00', actual: '600000.00', amount: '26000.00', held: '4000.00', heldReason: 'Paid late by Ananda Traders', released: true, workings: { attainment: '120.00' }, posted: true },
];
const sheet = (story?: { confirm?: string; refused?: string }, rows: IncentiveResultRow[] = ROWS) => () => <IncentiveResultsSheet plan={PLAN} month="October 2026" nameOf={(id) => NAMES[id] ?? ''} rows={rows} onRelease={async () => undefined} onClose={() => {}} story={story} />;
export const ResultsHeld: S = { name: 'Results sheet · a held row', render: sheet() };
export const ReleaseConfirm: S = { name: 'Results sheet · release the held part (asks first)', render: sheet({ confirm: 'r-1' }) };
export const ReleaseRefused: S = { name: 'Results sheet · release refused', render: sheet({ refused: "Send the month's results to payroll first; the held part follows them." }, ROWS.map((r) => ({ ...r, posted: false }))) };
