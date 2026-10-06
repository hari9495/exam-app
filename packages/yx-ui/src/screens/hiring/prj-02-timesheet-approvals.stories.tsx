import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimesheetApprovalsPhone, TimesheetApprovalsScreen } from './projects';
import { APPROVAL_GROUPS } from './projects-data';

const meta: Meta = { title: 'Screens/Projects/PRJ-02 · Timesheet approvals', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const ByProjectWeek: S = { name: 'PM · grouped by project and week', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} /> };
export const ClientApproval: S = { name: 'Client approval after PM', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} clientApproval /> };
export const BulkConfirm: S = { name: 'Bulk approve within allocation', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} bulkConfirm /> };
export const Empty: S = { name: 'Empty · all caught up', render: () => <TimesheetApprovalsScreen groups={[]} /> };
export const Loading: S = { name: 'Loading', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} state="error" /> };
export const Phone: S = { name: 'phone', globals: PHONE, render: () => <TimesheetApprovalsPhone groups={APPROVAL_GROUPS.slice(0, 1)} /> };
