import type { Meta, StoryObj } from '@storybook/react-vite';
import { PerformanceReportsScreen } from './perf-reports';
import type { PerfReport } from '../performance/live/types';

// Batch T2-C (2411, 2847): no earlier design had the performance reports page; these stories are its design, with
// Kaveri Foods data. Performance › Reports (/yx/performance/reports): people in my scope; small groups are hidden.
const meta: Meta = { title: 'Screens/Performance/Reports · Performance reports', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const noop = () => undefined;
const CYCLES = [{ value: 'c1', label: 'FY 2025-26 annual review' }, { value: 'c2', label: 'H1 2025-26' }];
const DIST: PerfReport = { kind: 'distribution', cycle: 'FY 2025-26 annual review', header: ['Department', 'Rating', 'People'], rows: [['Sales', 'Meets', 12], ['Sales', 'Exceeds', 6], ['Sales', 'Needs improvement', null], ['Production (Hosur plant)', 'Meets', 41], ['Production (Hosur plant)', 'Exceeds', 9]] };
const base = { cycles: CYCLES, cycleId: 'c1', onCycle: noop, onKind: noop, onDownload: async () => ({}) };
export const Distribution: S = { name: 'HR · rating distribution', render: () => <PerformanceReportsScreen state="ready" {...base} kind="distribution" report={DIST} /> };
export const Completion: S = { name: 'HR · completion', render: () => <PerformanceReportsScreen state="ready" {...base} kind="completion" report={{ kind: 'completion', cycle: 'FY 2025-26 annual review', header: ['Department', 'Reviews', 'Done', 'Done %'], rows: [['Sales', 24, 20, 83], ['Quality', 9, 9, 100]] }} /> };
export const NoCycles: S = { name: 'No cycles yet', render: () => <PerformanceReportsScreen state="ready" {...base} cycles={[]} cycleId={null} kind="completion" report={null} /> };
export const Loading: S = { render: () => <PerformanceReportsScreen state="loading" {...base} kind="completion" report={null} /> };
export const LoadError: S = { name: 'Could not load', render: () => <PerformanceReportsScreen state="error" onRetry={noop} {...base} kind="completion" report={null} /> };
export const NoAccess: S = { name: 'No access', render: () => <PerformanceReportsScreen state="no-access" {...base} kind="completion" report={null} /> };
