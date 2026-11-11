import type { Meta, StoryObj } from '@storybook/react-vite';
import { AttendanceMonthScreen, WorkersScreen } from './contract';
import { CONTRACTORS, WORKERS } from './contract-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-02 · Contract workers register', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { workers: WORKERS, contractors: CONTRACTORS, today: TODAY };

export const Register: S = { render: () => <WorkersScreen {...base} /> };
export const Deploy: S = { name: 'Deploy · checks pass', render: () => <WorkersScreen {...base} deploy="ok" /> };
export const LicenceFull: S = { name: 'Deploy · licence maximum reached', render: () => <WorkersScreen {...base} deploy="limit" /> };
export const Underage: S = { name: 'Deploy · under 18 blocked', render: () => <WorkersScreen {...base} deploy="underage" /> };
export const OutOfScope: S = { name: 'Deploy · licence scope excludes Kerala', render: () => <WorkersScreen {...base} deploy="scope" /> };
export const Empty: S = { render: () => <WorkersScreen {...base} workers={[]} state="empty" /> };
export const Error: S = { render: () => <WorkersScreen {...base} state="error" /> };
export const Duplicate: S = { name: 'Deploy · same ID already deployed (CL-2)', render: () => <WorkersScreen {...base} deploy="duplicate" /> };
export const Threshold: S = { name: 'Deploy · registration threshold warning (CL-2)', render: () => <WorkersScreen {...base} deploy="threshold" /> };
export const Approve: S = { name: 'Site approval · induction and gate pass (CL-2)', render: () => <WorkersScreen {...base} sheet={{ kind: 'approve', id: 'w6' }} /> };
export const Release: S = { name: 'Release a worker (CL-2)', render: () => <WorkersScreen {...base} sheet={{ kind: 'release', id: 'w1' }} /> };
export const ReadOnly: S = { name: 'Read only (view key, CL-2)', render: () => <WorkersScreen {...base} readOnly /> };
// CL-5 (answers 625, 684, 735): the gate pass card with the photo, renewal keeping the number, the kiosk PIN shown once.
export const GatePassCard: S = { name: 'Gate pass card (CL-5)', render: () => <WorkersScreen {...base} sheet={{ kind: 'card', id: 'w1' }} /> };
export const RenewPass: S = { name: 'Renew gate pass (CL-5)', render: () => <WorkersScreen {...base} sheet={{ kind: 'renew', id: 'w1' }} /> };
export const KioskPin: S = { name: 'Kiosk PIN shown once (CL-5)', render: () => <WorkersScreen {...base} sheet={{ kind: 'pin', id: 'w1', pin: '4821' }} /> };
const ATT_ROWS = [
  { contractorId: 'c1', contractor: 'Sri Lakshmi Facility Services', site: { id: 'hosur', name: 'Hosur plant' }, contractorEnters: false, confirmed: null, workers: WORKERS.slice(0, 3).map((w, i) => ({ deploymentId: w.id, name: w.name, gatePass: w.gatePass, present: 24 - i, days: [] })) },
  { contractorId: 'c4', contractor: 'Annapoorna Canteen Services', site: { id: 'blr', name: 'Bengaluru head office' }, contractorEnters: true, confirmed: { at: '2026-10-02T10:00:00', days: 52 }, workers: WORKERS.slice(3, 5).map((w) => ({ deploymentId: w.id, name: w.name, gatePass: w.gatePass, present: 26, days: [] })) },
];
export const AttendanceMonth: S = { name: 'Attendance month (CL-5)', render: () => <AttendanceMonthScreen month="2026-09" rows={ATT_ROWS} canManage canConfirm /> };
export const ConfirmMonth: S = { name: 'Confirm a month (CL-5)', render: () => <AttendanceMonthScreen month="2026-09" rows={ATT_ROWS} canManage canConfirm confirmOpen="c1:hosur" /> };
export const ConfirmZeroDays: S = { name: 'Confirm a month with 0 days (807)', render: () => <AttendanceMonthScreen month="2026-09" rows={[{ ...ATT_ROWS[0]!, workers: ATT_ROWS[0]!.workers.map((w) => ({ ...w, present: 0 })) }]} canManage canConfirm confirmOpen="c1:hosur" /> };
export const LowWage: S = { name: 'Deploy · wage below the minimum, a warning (810)', render: () => <WorkersScreen {...base} deploy="lowwage" /> };
