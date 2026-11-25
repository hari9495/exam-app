import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalibrationListScreen } from './calibration';

// No earlier design had the calibration sessions list; these stories are its design, with Kaveri Foods data.
const meta: Meta = { title: 'Screens/Performance/Calibration · Sessions list', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const noop = () => undefined;

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
