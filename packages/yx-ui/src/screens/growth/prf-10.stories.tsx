import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompReviewScreen, type LiveCompReview } from './perf-talent';
import { COMP_BUDGET, COMP_ROWS, EQUITY } from './perf-data-4';
import { d } from './perf-data';

const meta: Meta = { title: 'Screens/Performance/PRF-10 · Comp review sheet', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const BENCH = { source: 'Company salary survey upload', effective: d(1, 3) };

export const ManagerProposes: S = { name: 'Manager · proposals with out-of-range row', render: () => <CompReviewScreen persona="mgr" rows={COMP_ROWS} budget={COMP_BUDGET} equity={EQUITY.slice(0, 1)} benchmark={BENCH} /> };
export const Justify: S = { name: 'Manager · justification for out-of-range', render: () => <CompReviewScreen persona="mgr" rows={COMP_ROWS} budget={COMP_BUDGET} equity={EQUITY.slice(0, 1)} benchmark={BENCH} justifyFor="r3" /> };
export const HrApproves: S = { name: 'HR · approve with pay-equity panel', render: () => <CompReviewScreen persona="hr" rows={COMP_ROWS.map((r) => (r.id === 'r3' ? { ...r, justification: 'Well below peers after a late promotion.' } : r))} budget={COMP_BUDGET} equity={EQUITY} benchmark={BENCH} /> };
export const FinanceOverBudget: S = { name: 'Finance · over budget', render: () => <CompReviewScreen persona="fin" rows={COMP_ROWS.map((r) => ({ ...r, proposed: (r.proposed ?? 0) + 6, justification: 'Retention' }))} budget={COMP_BUDGET} equity={EQUITY} benchmark={BENCH} /> };
export const NoMarketData: S = { name: 'No market data', render: () => <CompReviewScreen persona="hr" rows={COMP_ROWS.map((r) => ({ ...r, market: undefined }))} budget={COMP_BUDGET} equity={EQUITY} benchmark={null} /> };
export const StaleMarketData: S = { name: 'Stale market data', render: () => <CompReviewScreen persona="hr" rows={COMP_ROWS} budget={COMP_BUDGET} equity={EQUITY} benchmark={{ source: 'Company salary survey upload', effective: d(1, 3, 2025), stale: true }} /> };
const sample: LiveCompReview = {
  onRetry: () => {},
  title: 'Comp review · FY 2026-27 increments',
  facts: '6 people · effective 1 Apr 2026 · open',
  budgets: [{ department: 'Quality', amount: 4_20_000, used: 3_10_000, remaining: 1_10_000, over: false }],
  equity: [{ dimension: 'Female', before: '6.4%', after: '1.9%' }, { dimension: 'Male', before: '', after: '', suppressed: true }],
  can: { submit: true, decide: false, budgets: true, open: false, apply: false },
  departments: [{ value: 'q', label: 'Quality' }],
  designations: [{ value: 'sqa', label: 'Senior QA Engineer' }],
  equityDimension: 'gender',
  onEquity: () => {},
  onPropose: async () => {},
  onSubmit: async () => {},
  onDecide: async () => {},
  onBudgets: async () => {},
  onOpenCycle: async () => {},
  onApply: async () => {},
};
const liveRows = COMP_ROWS.map((r) => ({ ...r, live: { band: 'Meets', compa: Math.round((r.ctc / r.gradeMid) * 100) / 100, range: [5, 9] as [number, number], outOfRange: (r.proposed ?? 0) > 9, newCtc: r.ctc * 1.06, increment: r.ctc * 0.06, belowPeers: r.id === 'r3', editable: true, promotionToDesignationId: r.id === 'r1' ? 'sqa' : null, promotionAmount: r.id === 'r1' ? 1_20_000 : 0, bonusAmount: 25_000 } }));
export const Proposal: S = { name: 'Manager · proposal with promotion and bonus', render: () => <CompReviewScreen persona="mgr" rows={liveRows} budget={[]} benchmark={null} justifyFor="r1" live={sample} /> };
export const Budgets: S = { name: 'HR · set a department budget', render: () => <CompReviewScreen persona="hr" rows={liveRows} budget={[]} benchmark={null} budgetsOpen live={sample} /> };
export const SendBack: S = { name: 'HR · send back with what to change', render: () => <CompReviewScreen persona="hr" rows={COMP_ROWS} budget={COMP_BUDGET} equity={EQUITY} benchmark={BENCH} sendBackOpen /> };
export const Apply: S = { name: 'HR · apply approved pay changes', render: () => <CompReviewScreen persona="hr" rows={liveRows} budget={[]} benchmark={null} applyOpen live={{ ...sample, can: { ...sample.can, apply: true, budgets: false } }} /> };
