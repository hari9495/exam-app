import type { TimesheetActivity } from './live/types';

// T2-D 55 and 62: samples for the My projects tab and the week's Activity card (stories and tests).
export const T2D_PROJECTS = [
  { id: 'p-nrp', code: 'NRP' },
  { id: 'p-kav', code: 'KAV' },
];
export const T2D_ACTIVITY: TimesheetActivity[] = [
  { action: 'timesheet_line.reduced', at: '2026-11-24T11:40:00Z', by: 'Suresh Iyer', projectId: 'p-nrp', task: 'Build', reason: 'Offsite on Tuesday' },
  { action: 'timesheet.submitted', at: '2026-11-22T12:05:00Z', by: 'Ravi Kumar', projectId: null, task: null, reason: null },
  { action: 'timesheet.withdrawn', at: '2026-11-22T11:50:00Z', by: 'Ravi Kumar', projectId: null, task: null, reason: null },
  { action: 'timesheet.submitted', at: '2026-11-22T11:30:00Z', by: 'Ravi Kumar', projectId: null, task: null, reason: null },
];
