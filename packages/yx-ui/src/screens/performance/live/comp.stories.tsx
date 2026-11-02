import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompCyclesScreen } from './comp';
import type { CompCycle } from './types';

// Comp review, wired (batch PM7; PRF-10, PAY-39, YX-PERF-18). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Comp review', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
const cycle: CompCycle = { id: 'c1', name: 'FY27 merit', reviewCycleId: 'r1', legalEntityId: 'le1', currency: 'INR', effectiveOn: '2027-04-01', matrixId: 'm1', bonus: null, status: 'open', appliedAt: null, version: 2 };

export const Cycles: S = { render: () => <CompCyclesScreen state="ready" cycles={[cycle]} canManage matrices={[{ id: 'm1', name: 'Merit matrix', axis: 'compa_ratio', status: 'active', starter: true, version: 1, cells: [] }]} entities={[{ value: 'le1', label: 'Kaveri Foods' }]} reviewCycles={[{ value: 'r1', label: 'FY26 annual' }]} onStarterMatrix={ok} onCreate={ok} onOpen={noop} /> };
