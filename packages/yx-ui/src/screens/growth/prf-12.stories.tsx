import type { Meta, StoryObj } from '@storybook/react-vite';
import { PipRecordScreen } from './perf-people';
import { PIP, PIP_NOT_MET, PIP_PROPOSED, PIP_TO_ACK } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-12 · PIP record', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const ManagerActive: S = { name: 'Manager · active plan', render: () => <PipRecordScreen persona="mgr" pip={PIP} /> };
export const CheckIns: S = { name: 'Manager · check-ins', render: () => <PipRecordScreen persona="mgr" pip={PIP} tab="checkins" /> };
export const HrApproval: S = { name: 'HR · approve proposed plan', render: () => <PipRecordScreen persona="hr" pip={PIP_PROPOSED} /> };
export const RecordOutcome: S = { name: 'Manager · record outcome', render: () => <PipRecordScreen persona="mgr" pip={PIP} tab="outcome" outcomeOpen /> };
export const NotMet: S = { name: 'HR · not met (next step is manual)', render: () => <PipRecordScreen persona="hr" pip={PIP_NOT_MET} tab="outcome" /> };
export const EmployeeAck: S = { name: 'Employee · acknowledge', render: () => <PipRecordScreen persona="emp" pip={PIP_TO_ACK} tab="ack" /> };
export const EmployeeAckPhone: S = { name: 'Employee · acknowledge on phone', globals: PHONE, render: () => <PipRecordScreen persona="emp" device="phone" pip={PIP_TO_ACK} /> };
