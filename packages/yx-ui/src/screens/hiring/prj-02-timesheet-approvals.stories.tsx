import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimesheetApprovalsPhone, TimesheetApprovalsScreen, type LiveTimesheetApprovals } from './projects';
import { LIVE_LINE_APPROVALS } from './projects-live-fixtures';
import { APPROVAL_GROUPS } from './projects-data';

const meta: Meta = { title: 'Screens/Projects/PRJ-02 · Timesheet approvals', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const ByProjectWeek: S = { name: 'PM · grouped by project and week', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} /> };
export const ClientApproval: S = { name: 'Client approval after PM', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} clientApproval /> };
export const BulkConfirm: S = { name: 'Bulk approve within allocation', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} bulkConfirm /> };
const NOT_SENT = [
  { employeeId: 'e1', name: 'Arjun Mehta', projects: ['NRP-WEB'], weeks: [{ week: '2026-09-21', status: 'sent_back' as const, totalMinutes: 2280, locked: false }, { week: '2026-09-07', status: 'not_started' as const, totalMinutes: 0, locked: false }], remindedAt: null, canRemind: true },
  { employeeId: 'e2', name: 'Kavya Iyer', projects: ['CLL-WMS'], weeks: [{ week: '2026-09-14', status: 'draft' as const, totalMinutes: 960, locked: false }], remindedAt: '2026-09-28T04:30:00.000Z', canRemind: false },
];
export const NotSent: S = { name: 'PM · Not sent tab (batch D 2535)', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} notSent={NOT_SENT} /> };
export const Empty: S = { name: 'Empty · all caught up', render: () => <TimesheetApprovalsScreen groups={[]} /> };
export const Loading: S = { name: 'Loading', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <TimesheetApprovalsScreen groups={APPROVAL_GROUPS} state="error" /> };
export const Phone: S = { name: 'phone', globals: PHONE, render: () => <TimesheetApprovalsPhone groups={APPROVAL_GROUPS.slice(0, 1)} /> };

// Projects P-2 (answers 1406 to 1408, 1442): the live states.
const ok = async () => undefined;
const live = (over: Partial<LiveTimesheetApprovals> = {}): LiveTimesheetApprovals => ({ state: 'ready', data: LIVE_LINE_APPROVALS, onDecide: ok, onBulk: ok, ...over });
export const LiveByProject: S = { name: 'Live · my lines by project and week', render: () => <TimesheetApprovalsScreen live={live()} /> };
export const LiveBulk: S = { name: 'Live · bulk approve within allocation', render: () => <TimesheetApprovalsScreen live={live({ defaultBulk: true })} /> };
export const LiveEmpty: S = { name: 'Live · all caught up', render: () => <TimesheetApprovalsScreen live={live({ data: { withinAllocation: true, groups: [] } })} /> };
export const LiveLoading: S = { name: 'Live · loading', render: () => <TimesheetApprovalsScreen live={live({ state: 'loading', data: null })} /> };
export const LiveError: S = { name: 'Live · error', render: () => <TimesheetApprovalsScreen live={live({ state: 'error', data: null })} /> };

// Projects P-4 (answer 1541): the week against attendance on a card.
export const LiveMismatch: S = { name: 'Live · timesheet against attendance', render: () => <TimesheetApprovalsScreen live={live({ data: { ...LIVE_LINE_APPROVALS, groups: [{ ...LIVE_LINE_APPROVALS.groups[0]!, items: [{ ...LIVE_LINE_APPROVALS.groups[0]!.items[1]!, mismatch: 'Timesheet 42 h vs attendance 40 h worked' }] }] } })} /> };
