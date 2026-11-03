import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExpenseReportsScreen } from './expenses-finance';
import { AGEING, MY_CLAIMS, TO_PAY } from './expenses-data';
import { PATTERNS_REPORT } from './expenses-live-samples';

const meta: Meta = { title: 'Screens/Expenses/EXP-09 · Expense reports', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const claims = [...MY_CLAIMS, ...TO_PAY.slice(1)];

export const Summary: S = { render: () => <ExpenseReportsScreen claims={claims} ageing={AGEING} /> };
export const Ageing: S = { name: 'Advance ageing', render: () => <ExpenseReportsScreen claims={claims} ageing={AGEING} tab="ageing" /> };
export const Unpaid: S = { name: 'Unpaid claims (net payable first)', render: () => <ExpenseReportsScreen claims={claims} ageing={AGEING} tab="unpaid" /> };
export const OverLimit: S = { name: 'Over limit', render: () => <ExpenseReportsScreen claims={claims} ageing={AGEING} tab="over" /> };
export const Gst: S = { name: 'GST input', render: () => <ExpenseReportsScreen claims={claims} ageing={AGEING} tab="gst" /> };
export const Loading: S = { render: () => <ExpenseReportsScreen claims={claims} ageing={AGEING} loading /> };

// The approver-patterns report (a state the real record has), drawn with the designed screen and sample data.
export const ApproverPatterns: S = {
  name: 'Approver patterns · a second look, never a block',
  render: () => <ExpenseReportsScreen live={{ state: 'ready', onRetry: () => {}, kind: 'approver-patterns', report: PATTERNS_REPORT, from: '2026-09-01', to: '2026-09-30', departments: [], entityName: null, onKind: () => {}, onFilters: () => {}, onExport: async () => ({}) }} />,
};
