import type { Meta, StoryObj } from '@storybook/react-vite';
import { SchedulesScreen } from '../analytics';

const meta: Meta<typeof SchedulesScreen> = { title: 'Screens/Analytics/ANL-08 · Schedules and export log', component: SchedulesScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof SchedulesScreen>;

export const Schedules: S = {};
export const NewSchedule: S = { name: 'New schedule (secure link for Confidential)', args: { dialog: true } };
export const ExportLog: S = { name: 'Export log', args: { tab: 'exports' } };
export const Auditor: S = { name: 'Auditor: export log only', args: { persona: 'Auditor' } };

// Answer 2428: live, the weekly hiring digest (Hire › Schedules).
const people = [{ id: 'u1', name: 'Meera Iyer' }, { id: 'u2', name: 'Suresh Pillai' }, { id: 'u3', name: 'Divya Rao' }];
const liveSched = (over: Partial<import('../analytics-live').LiveSchedules> = {}) => ({ state: 'ready' as const, onRetry: () => undefined, digest: { enabled: true, recipientIds: ['u1', 'u2'], lastSentAt: '2026-11-16T03:30:00.000Z' }, people, onSave: () => Promise.resolve(), ...over });
export const LiveDigestOn: S = { name: 'Live · weekly hiring digest on', args: { live: liveSched() } };
export const LiveDigestOff: S = { name: 'Live · weekly hiring digest off, never sent', args: { live: liveSched({ digest: { enabled: false, recipientIds: [], lastSentAt: null } }) } };
export const LiveDigestLoading: S = { name: 'Live · loading', args: { live: liveSched({ state: 'loading' }) } };
export const LiveDigestError: S = { name: 'Live · could not load', args: { live: liveSched({ state: 'error' }) } };
const LIB = {
  state: 'ready' as const,
  schedules: [{ id: 's1', target: 'Mandatory training compliance', frequency: 'weekly' as const, recipients: ['Lakshmi Venkatesan', 'Arjun Nair'], delivery: 'Email · CSV attached', sensitivity: 'Internal' as const, nextRunAt: '2026-11-30T01:30:00.000Z', lastRunAt: '2026-11-23T01:30:00.000Z', lastResult: 'Sent to 2 of 2' }],
  reports: [{ id: 'learning.compliance', name: 'Mandatory training compliance', sensitivity: 'Internal' as const }, { id: 'perf.completion', name: 'Review completion', sensitivity: 'Confidential' as const }],
  people: [{ id: 'u1', name: 'Lakshmi Venkatesan' }, { id: 'u2', name: 'Arjun Nair' }],
  onCreate: () => Promise.resolve(),
  onEnd: () => Promise.resolve(),
  exportLog: { rows: [{ id: 'x1', at: '2026-11-24T05:00:00.000Z', who: 'Lakshmi Venkatesan', what: 'Payroll report', detail: 'register', rows: 412, sensitivity: 'Confidential' as const }], onDownload: () => Promise.resolve() },
};
export const LiveLibrary: S = { name: 'Live · schedules and export log', render: () => <SchedulesScreen library={LIB} /> };
export const LiveExportOnly: S = { name: 'Live · auditor: export log only', render: () => <SchedulesScreen library={{ ...LIB, reports: [], schedules: [] }} /> };
// T2-G 46: the import log next to the export log (same key holders): each file, rows in and rows not in.
const IMPORTS = { rows: [{ id: 'i1', at: '2026-11-25T06:10:00.000Z', who: 'Lakshmi Venkatesan', what: 'Employees', detail: 'november-joiners.csv', ok: 38, failed: 2 }, { id: 'i2', at: '2026-11-24T09:40:00.000Z', who: 'Arjun Nair', what: 'Payroll inputs (checked)', detail: 'variable_pay', ok: 410, failed: 0 }] };
export const LiveImportLog: S = { name: 'Live · import log', render: () => <SchedulesScreen library={{ ...LIB, importLog: IMPORTS }} /> };
export const LiveLogsOnly: S = { name: 'Live · auditor: export and import logs only', render: () => <SchedulesScreen library={{ ...LIB, reports: [], schedules: [], importLog: { rows: [] } }} /> };
