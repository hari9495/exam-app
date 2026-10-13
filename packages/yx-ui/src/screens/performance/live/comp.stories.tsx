import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompCyclesScreen, CompSheetScreen, MyPayBandScreen, type CompSheetScreenProps } from './comp';
import type { CompCycle, CompProposal } from './types';

// Comp review, wired (batch PM7; PRF-10, PAY-39, YX-PERF-18). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Comp review', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
const cycle: CompCycle = { id: 'c1', name: 'FY27 merit', reviewCycleId: 'r1', legalEntityId: 'le1', currency: 'INR', effectiveOn: '2027-04-01', matrixId: 'm1', bonus: null, status: 'open', appliedAt: null, version: 2 };
const proposal = (o: Partial<CompProposal> = {}): CompProposal => ({ id: 'p1', employee: 'Arjun Rao', employeeId: 'e1', departmentId: 'd1', manager: 'Priya Nair', band: 'Exceeds', currentCtc: 850_000, compaRatio: 1.063, proration: 1, cell: { band: 'Exceeds', minPct: 7, targetPct: 9, maxPct: 11 }, meritPct: 9, meritAmount: 76_500, promotionToGradeId: null, promotionToDesignationId: null, promotionAmount: 0, bonusAmount: 25_000, newCtc: 926_500, outOfRange: false, justification: null, status: 'draft', version: 1, ...o });
const sheet: CompSheetScreenProps = {
  state: 'ready',
  sheet: { cycle, role: 'manager', proposals: [proposal(), proposal({ id: 'p2', employee: 'Sita Iyer', band: 'Meets', meritPct: 20, outOfRange: true, justification: 'Took over the region' })], budgets: [{ departmentId: 'd1', department: 'Sales', kind: 'merit', amount: 120_000, used: 246_500, remaining: -126_500, over: true }], overrun: 'extra_approval', can: { edit: true, submit: true, apply: false } },
  departments: [{ value: 'd1', label: 'Sales' }],
  designations: [{ value: 'x1', label: 'Lead' }],
  onBack: noop,
  onBudgets: ok,
  onOpenCycle: ok,
  onSave: ok,
  onSubmit: ok,
  onApply: ok,
};

export const Cycles: S = { render: () => <CompCyclesScreen state="ready" cycles={[cycle]} canManage matrices={[{ id: 'm1', name: 'Merit matrix', axis: 'compa_ratio', status: 'active', starter: true, version: 1, cells: [] }]} entities={[{ value: 'le1', label: 'Kaveri Foods' }]} reviewCycles={[{ value: 'r1', label: 'FY26 annual' }]} onStarterMatrix={ok} onCreate={ok} onOpen={noop} /> };
export const ManagerSheet: S = { render: () => <CompSheetScreen {...sheet} /> };
export const HrSheetWithEquity: S = { render: () => <CompSheetScreen {...sheet} sheet={{ ...sheet.sheet!, role: 'hr', can: { edit: true, submit: false, apply: true } }} equity={{ dimension: 'gender', before: [{ group: 'Female', count: 12, suppressed: false, meanGapPct: -6.2, medianGapPct: -4.1, adjustedGapPct: -1.3 }, { group: 'Other', count: null, suppressed: true }], after: [{ group: 'Female', count: 12, suppressed: false, meanGapPct: -4.8, medianGapPct: -3.0, adjustedGapPct: -0.6 }, { group: 'Other', count: null, suppressed: true }], flagged: [{ employeeId: 'e9', employee: 'Meena Pillai' }], threshold: 10, min: 5 }} onEquity={ok} /> };
export const MyBand: S = { render: () => <MyPayBandScreen state="ready" band={{ visible: true, currency: 'INR', range: { min: 600_000, mid: 800_000, max: 1_000_000 }, position: 'within', quartile: 3 }} /> };
