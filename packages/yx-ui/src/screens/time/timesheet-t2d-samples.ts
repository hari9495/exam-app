import type { MyProject, TimesheetActivity } from './live/types';

// T2-D 55 and 62: samples for the My projects tab and the week's Activity card (stories and tests).
export const T2D_PROJECTS = [
  { id: 'p-nrp', code: 'NRP' },
  { id: 'p-kav', code: 'KAV' },
];
export const T2D_MY_PROJECTS: MyProject[] = [
  { id: 'p-kav', code: 'KAV', name: 'Kaveri billing revamp', status: 'closed', manager: 'Farah Khan', current: false, allocations: [{ role: 'Developer', fromOn: '2026-04-01', toOn: '2026-08-31', percent: 50, tentative: false }], bookedMinutes: 9_600, approvedMinutes: 9_120 },
  { id: 'p-nrp', code: 'NRP', name: 'Nilgiri Retail web rebuild', status: 'active', manager: 'Suresh Iyer', current: true, allocations: [{ role: 'Developer', fromOn: '2026-09-01', toOn: null, percent: 80, tentative: false }], bookedMinutes: 25_200, approvedMinutes: 22_800 },
];
export const T2D_ACTIVITY: TimesheetActivity[] = [
  { action: 'timesheet_line.reduced', at: '2026-11-24T11:40:00Z', by: 'Suresh Iyer', projectId: 'p-nrp', task: 'Build', reason: 'Offsite on Tuesday' },
  { action: 'timesheet.submitted', at: '2026-11-22T12:05:00Z', by: 'Ravi Kumar', projectId: null, task: null, reason: null },
  { action: 'timesheet.withdrawn', at: '2026-11-22T11:50:00Z', by: 'Ravi Kumar', projectId: null, task: null, reason: null },
  { action: 'timesheet.submitted', at: '2026-11-22T11:30:00Z', by: 'Ravi Kumar', projectId: null, task: null, reason: null },
];
