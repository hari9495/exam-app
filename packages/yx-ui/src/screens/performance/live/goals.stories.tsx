import type { Meta, StoryObj } from '@storybook/react-vite';
import { GoalMapScreen, GoalScreen, GoalsScreen, type GoalScreenProps, type GoalsScreenProps } from './goals';
import type { GoalDetail, GoalSummary } from './types';

// Goals and OKRs, wired (batch PM2; PRF-01 / 02 / 03). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Goals', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
const period = { id: 'p1', name: 'H2 FY 2026-27', fromOn: '2026-10-01', toOn: '2027-03-31', status: 'open' as const };
const goal = (o: Partial<GoalSummary> = {}): GoalSummary => ({ id: 'g1', periodId: 'p1', ownerType: 'person', ownerEmployeeId: 'e1', ownerDepartmentId: null, owner: 'Arjun Rao', parentGoalId: 'g0', kind: 'okr', title: 'Close three new accounts', weight: 60, status: 'active', progress: 66.67, version: 2, ...o });
const detail: GoalDetail = {
  ...goal(),
  description: 'New distributors in Tamil Nadu.',
  keyResults: [{ id: 'k1', title: 'Accounts signed', unit: 'accounts', direction: 'up', start: 0, target: 3, current: 2, weight: 1, progress: 66.67 }],
  parent: { id: 'g0', title: 'Grow my team’s revenue', progress: 66.67 },
  children: [],
  checkins: [{ id: 'c1', on: '2026-10-10', progress: 66.67, confidence: 'on_track', note: 'Two signed' }],
  pendingChange: null,
  decisionNote: null,
  can: { edit: true, checkIn: true, drop: true, cascade: true },
};
const listProps: GoalsScreenProps = {
  state: 'ready',
  periods: [period],
  periodId: 'p1',
  onPeriod: noop,
  view: 'mine',
  onView: noop,
  goals: [goal(), goal({ id: 'g2', title: 'Train two inspectors', weight: 30, status: 'draft', progress: 0 })],
  totalWeight: 90,
  canManage: false,
  departments: [{ value: 'd1', label: 'Sales' }],
  alignOptions: [{ id: 'g0', title: 'Grow my team’s revenue', owner: 'Priya Nair' }],
  onCreate: ok,
  onSubmitGoals: ok,
  onAddPeriod: ok,
  onOpen: noop,
};
const goalProps: GoalScreenProps = { state: 'ready', goal: detail, alignOptions: listProps.alignOptions, departments: listProps.departments, team: [{ value: 'e2', label: 'Sita' }], onBack: noop, onSave: ok, onCheckIn: ok, onDrop: ok, onCascade: ok, onOpen: noop };

export const MyGoals: S = { name: 'My goals (weights not yet 100, a draft to send)', render: () => <GoalsScreen {...listProps} /> };
export const NoPeriod: S = { name: 'No goal periods yet (HR)', render: () => <GoalsScreen {...listProps} periods={[]} periodId={null} goals={[]} totalWeight={null} canManage /> };
export const Goal: S = { name: 'One goal with a check-in', render: () => <GoalScreen {...goalProps} /> };
export const PendingChange: S = { name: 'A change waiting for the manager', render: () => <GoalScreen {...goalProps} goal={{ ...detail, pendingChange: { title: 'Close four new accounts' }, can: { ...detail.can, edit: false } }} /> };
export const Map: S = {
  name: 'Company goal map',
  render: () => (
    <GoalMapScreen
      state="ready"
      periods={[period]}
      periodId="p1"
      onPeriod={noop}
      onOpen={noop}
      map={{ goals: [goal({ id: 't1', ownerType: 'team', owner: 'Sales', parentGoalId: null, title: 'Sales team revenue', kind: 'kpi' }), goal({ id: 'g0', owner: 'Priya Nair', parentGoalId: 't1', title: 'Grow my team’s revenue' }), goal({ parentGoalId: 'g0' }), goal({ id: 'g9', owner: 'Sita', parentGoalId: null, title: 'Improve demo quality', progress: 10 })], unaligned: ['g9'], offTrack: ['g9'] }}
    />
  ),
};
