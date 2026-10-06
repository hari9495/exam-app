import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompReviewScreen } from './perf-talent';
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
