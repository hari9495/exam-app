import type { Meta, StoryObj } from '@storybook/react-vite';
import { MetricExplorerScreen } from '../analytics';

const meta: Meta<typeof MetricExplorerScreen> = { title: 'Screens/Analytics/ANL-04 · Metric explorer', component: MetricExplorerScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MetricExplorerScreen>;

export const Breakdown: S = {};
export const Trend: S = { args: { view: 'trend' } };
export const Table: S = { args: { view: 'table' } };
export const Suppressed: S = { name: 'Small groups suppressed', args: { suppressed: true } };
export const Loading: S = { args: { loading: true } };

// T2-G 47 (answer 2747): live for headcount and attrition (months, the company's totals and the split).
const VIEW = {
  from: '2025-11',
  to: '2026-10',
  by: 'department' as const,
  minGroup: 5,
  months: ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month, i) => ({ month, headcount: 236 + i })),
  total: { avgHeadcount: 241.5, exits: 31, voluntary: 24, involuntary: 5, notRecorded: 2, rate: 12.8, voluntaryRate: 9.9 },
  groups: [
    { id: 'd1', name: 'Engineering', hidden: false as const, avgHeadcount: 64, exits: 9, voluntary: 8, involuntary: 1, notRecorded: 0, rate: 14.1, voluntaryRate: 12.5 },
    { id: 'd2', name: 'Operations', hidden: false as const, avgHeadcount: 88, exits: 14, voluntary: 10, involuntary: 3, notRecorded: 1, rate: 15.9, voluntaryRate: 11.4 },
    { id: 'd3', name: 'Quality', hidden: false as const, avgHeadcount: 26, exits: 3, voluntary: 2, involuntary: 1, notRecorded: 0, rate: 11.5, voluntaryRate: 7.7 },
    { id: 'd4', name: 'People', hidden: true as const },
  ],
};
const LIVE = { state: 'ready' as const, onRetry: () => {}, data: VIEW, by: 'department' as const, onBy: () => {}, periods: [{ value: '2025-11|2026-10', label: 'Last 12 months' }], period: '2025-11|2026-10', onPeriod: () => {}, onExport: () => new Promise<void>((r) => setTimeout(r, 400)) };
export const LiveAttrition: S = { name: 'Live · headcount and attrition (T2-G 47)', args: { live: LIVE } };
export const LiveAttritionLoading: S = { name: 'Live · headcount and attrition · loading', args: { live: { ...LIVE, state: 'loading', data: null } } };
export const LiveAttritionNoAccess: S = { name: 'Live · headcount and attrition · no access', args: { live: { ...LIVE, state: 'no-access', data: null } } };
