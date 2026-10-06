import type { Meta, StoryObj } from '@storybook/react-vite';
import { ATTENDANCE_GROUPS, FINDINGS, INPUT_SOURCES, RunReadinessScreen } from './payroll-run';

const meta: Meta<typeof RunReadinessScreen> = { title: 'Screens/Pay/PAY-02 · Run readiness', component: RunReadinessScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof RunReadinessScreen>;

export const Blocked: S = { name: 'Blocking items' };
export const WaiveDialog: S = { name: 'Waive with reason (dialog open)', args: { defaultWaiveId: 'f3' } };
export const AllClear: S = {
  name: 'Ready to calculate',
  args: {
    findings: FINDINGS.map((f) => (f.severity === 'ok' ? f : { ...f, severity: 'ok' as const, detail: 'Resolved.', count: 0, ids: [] })),
    groups: ATTENDANCE_GROUPS.map((g) => ({ ...g, exceptions: 0 })),
    inputs: INPUT_SOURCES.map((s) => ({ ...s, status: 'Received' as const })),
    coverage: [],
  },
};
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
