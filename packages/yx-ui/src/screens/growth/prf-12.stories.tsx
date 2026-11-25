import type { Meta, StoryObj } from '@storybook/react-vite';
import { PipRecordScreen, type LivePip } from './perf-people';
import { PIP, PIP_NOT_MET, PIP_PROPOSED, PIP_TO_ACK } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-12 · PIP record', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
// The phone stories for HR and the manager use the live app's own rules (the `can` flags the API sends), so they draw
// exactly what the live page shows under 768 px (founder, 3 Nov 2026).
const noop = async () => {};
const can = (c: Partial<LivePip['can']>): LivePip => ({
  today: new Date(2026, 6, 20),
  can: { decide: false, acknowledge: false, checkin: false, employeeNote: false, outcome: false, letter: false, startExit: false, ...c },
  extendDays: 30,
  askHrHref: '#',
  onDecide: noop,
  onAcknowledge: noop,
  onCheckin: noop,
  onOutcome: noop,
  onLetter: noop,
  onEmployeeNote: noop,
  onStartExit: noop,
});

export const ManagerActive: S = { name: 'Manager · active plan', render: () => <PipRecordScreen persona="mgr" pip={PIP} /> };
export const CheckIns: S = { name: 'Manager · check-ins', render: () => <PipRecordScreen persona="mgr" pip={PIP} tab="checkins" /> };
export const HrApproval: S = { name: 'HR · approve proposed plan', render: () => <PipRecordScreen persona="hr" pip={PIP_PROPOSED} /> };
export const RecordOutcome: S = { name: 'Manager · record outcome', render: () => <PipRecordScreen persona="mgr" pip={PIP} tab="outcome" outcomeOpen /> };
export const NotMet: S = { name: 'HR · not met (next step is manual)', render: () => <PipRecordScreen persona="hr" pip={PIP_NOT_MET} tab="outcome" /> };
export const EmployeeAck: S = { name: 'Employee · acknowledge', render: () => <PipRecordScreen persona="emp" pip={PIP_TO_ACK} tab="ack" /> };
export const EmployeeAckPhone: S = { name: 'Employee · acknowledge on phone', globals: PHONE, render: () => <PipRecordScreen persona="emp" device="phone" pip={PIP_TO_ACK} /> };
export const ManagerPhone: S = { name: 'Manager · phone', globals: PHONE, render: () => <PipRecordScreen persona="mgr" device="phone" pip={PIP} live={can({ checkin: true })} /> };
export const HrPhone: S = { name: 'HR · phone', globals: PHONE, render: () => <PipRecordScreen persona="hr" device="phone" pip={{ ...PIP_PROPOSED, warning: true }} live={can({ decide: true })} /> };
export const HrLetterPhone: S = { name: 'HR · phone · issue letter', globals: PHONE, render: () => <PipRecordScreen persona="hr" device="phone" pip={PIP} live={can({ letter: true, outcome: true })} /> };
export const RecordCheckIn: S = { name: 'Manager · record check-in', render: () => <PipRecordScreen persona="mgr" pip={PIP} tab="checkins" checkinOpen /> };
export const SendBack: S = { name: 'HR · send back with a reason', render: () => <PipRecordScreen persona="hr" pip={{ ...PIP_PROPOSED, warning: true }} sendBackOpen /> };
export const ExtendAfterNotMet: S = { name: 'HR · extend once more after not met', render: () => <PipRecordScreen persona="hr" pip={PIP_NOT_MET} tab="outcome" extendAgainOpen /> };
export const StartExit: S = { name: 'HR · open exit case after not met', render: () => <PipRecordScreen persona="hr" pip={PIP_NOT_MET} tab="outcome" exitOpen /> };
