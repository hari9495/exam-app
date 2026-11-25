import type { Meta, StoryObj } from '@storybook/react-vite';
import { DisputeListScreen, DisputeRaiseScreen, DisputeRecordScreen } from './perf-reviews';
import { DISPUTE } from './perf-data-3';

const meta: Meta = { title: 'Screens/Performance/PRF-15 · Dispute escalation and evidence export', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const EmployeeEscalates: S = { name: 'Employee · escalate', render: () => <DisputeRaiseScreen /> };
export const EmployeeSent: S = { name: 'Employee · escalation raised', render: () => <DisputeRaiseScreen dispute={DISPUTE} sent /> };
export const EmployeePhone: S = { name: 'Employee · phone', globals: PHONE, render: () => <DisputeRaiseScreen device="phone" /> };
export const HrRecord: S = { name: 'HR · dispute record with legal hold', render: () => <DisputeRecordScreen dispute={DISPUTE} /> };
export const HrExport: S = { name: 'HR · evidence export', render: () => <DisputeRecordScreen dispute={DISPUTE} exportOpen /> };
export const HrDecision: S = { name: 'HR · record decision', render: () => <DisputeRecordScreen dispute={DISPUTE} decideOpen /> };
export const HrList: S = {
  name: 'HR · open disputes',
  render: () => (
    <DisputeListScreen
      rows={[
        { id: 'd1', ref: 'PRF-D-0412', employee: 'Vikram Singh', cycle: 'Annual review FY 2025-26', raised: new Date(2026, 6, 22), status: 'Raised', legalHold: true },
        { id: 'd2', ref: 'PRF-D-0398', employee: 'Asha Pillai', cycle: 'Annual review FY 2025-26', raised: new Date(2026, 5, 30), status: 'Resolved', legalHold: false },
      ]}
    />
  ),
};
export const HrListEmpty: S = { name: 'HR · no disputes', render: () => <DisputeListScreen rows={[]} /> };
export const HrExported: S = { name: 'HR · exported', render: () => <DisputeRecordScreen dispute={DISPUTE} exported /> };
