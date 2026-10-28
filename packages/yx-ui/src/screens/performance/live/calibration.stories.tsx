import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalibrationBoardScreen, CalibrationListScreen, CalibrationSessions, PerformanceReportsScreen } from './calibration';
import type { CalibrationBoard } from './types';

// Calibration and reports, wired (batch PM6; PRF-09). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Calibration', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
const bands = [
  { fromScore: 1, toScore: 2.49, label: 'Below' },
  { fromScore: 2.5, toScore: 3.49, label: 'Meets' },
  { fromScore: 3.5, toScore: 5, label: 'Above' },
];
const row = (id: string, employee: string, score: number, band: string, o: Partial<CalibrationBoard['rows'][number]> = {}) => ({ reviewId: id, employee, manager: 'Priya Nair', managerScore: score, score, band, moved: false, selfIndication: 4, skipAgreed: true, protectedLeave: false, ...o });
const board: CalibrationBoard = {
  id: 's1',
  name: 'Sales H1',
  cycle: 'H1 2025-26',
  status: 'open',
  guide: { bands: [{ label: 'Below', share: 10 }, { label: 'Meets', share: 70 }, { label: 'Above', share: 20 }], tolerance: 10 },
  scale: { min: 1, max: 5, bands },
  rows: [row('r1', 'Arjun Rao', 4, 'Above'), row('r2', 'Sita Iyer', 4, 'Above'), row('r3', 'Meena Pillai', 3, 'Meets'), row('r4', 'Lakshmi N', 3, 'Meets', { moved: true, managerScore: 4 }), row('r5', 'Ravi Kumar', 2, 'Below', { protectedLeave: true })],
  distribution: { bands: [{ label: 'Below', count: 0, share: 0, target: 10, outside: false }, { label: 'Meets', count: 2, share: 50, target: 70, outside: true }, { label: 'Above', count: 2, share: 50, target: 20, outside: true }], counted: 4, notes: ['Meets: 50% against a guide of 70%.', 'Above: 50% against a guide of 20%.'] },
  changes: [{ reviewId: 'r4', employee: 'Lakshmi N', from: 4, to: 3, fromBand: 'Above', toBand: 'Meets', reason: 'Compared with the plant leads', at: '2026-10-20T09:00:00.000Z' }],
  can: { change: true, signOff: true },
};

export const Board: S = { render: () => <CalibrationBoardScreen state="ready" board={board} onBack={noop} onChange={ok} onSignOff={ok} /> };
export const SmallGroup: S = { render: () => <CalibrationBoardScreen state="ready" board={{ ...board, guide: null, distribution: { bands: null, counted: 3, notes: [] }, can: { change: false, signOff: false } }} onBack={noop} onChange={ok} onSignOff={ok} /> };
export const Sessions: S = { render: () => <div className="yx-auth__page"><CalibrationSessions sessions={[{ id: 's1', name: 'Sales H1', facilitator: 'Lakshmi R', status: 'open', people: 12 }]} departments={[{ value: 'd1', label: 'Sales' }]} facilitators={[{ value: 'u1', label: 'Lakshmi R' }]} bands={['Below', 'Meets', 'Above']} onOpen={noop} onCreate={ok} /></div> };
export const Reports: S = { render: () => <PerformanceReportsScreen state="ready" cycles={[{ value: 'c1', label: 'H1 2025-26' }]} cycleId="c1" onCycle={noop} kind="distribution" onKind={noop} report={{ kind: 'distribution', cycle: 'H1 2025-26', header: ['department', 'band', 'people'], rows: [['Sales', 'Meets', 12], ['Sales', 'Below', null]] }} onDownload={ok} /> };

// Performance › Calibration (/yx/performance/calibrations): the sessions I run, or every session for HR.
const SESSIONS = [
  { id: 's1', name: 'Sales H1', facilitator: 'Lakshmi Venkatesan', status: 'open' as const, people: 12 },
  { id: 's2', name: 'Plant supervisors, Hosur', facilitator: 'Suresh Pillai', status: 'open' as const, people: 18 },
  { id: 's3', name: 'Finance and accounts', facilitator: 'Meena Raghavan', status: 'signed_off' as const, people: 7 },
];
export const List: S = { name: 'Calibration sessions · list', render: () => <CalibrationListScreen state="ready" sessions={SESSIONS} onOpen={noop} /> };
export const ListEmpty: S = { name: 'Calibration sessions · none yet', render: () => <CalibrationListScreen state="ready" sessions={[]} onOpen={noop} /> };
export const ListLoading: S = { name: 'Calibration sessions · loading', render: () => <CalibrationListScreen state="loading" sessions={[]} onOpen={noop} /> };
export const ListError: S = { name: 'Calibration sessions · could not load', render: () => <CalibrationListScreen state="error" onRetry={noop} sessions={[]} onOpen={noop} /> };
export const ListNoAccess: S = { name: 'Calibration sessions · no access', render: () => <CalibrationListScreen state="no-access" sessions={[]} onOpen={noop} /> };
