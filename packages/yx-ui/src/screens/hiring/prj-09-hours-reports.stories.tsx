import type { Meta, StoryObj } from '@storybook/react-vite';
import { HoursReportsScreen, type HoursReportData, type LiveHoursReports } from './projects-reports';

const meta: Meta = { title: 'Screens/Projects/PRJ-09 · Hours reports', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

// T2-D 60 (answer 2871): hours by person and hours by task, filtered by project, client and dates, with CSV export.
export const BY_PERSON: HoursReportData = {
  kind: 'person',
  scope: 'all',
  projects: [{ id: 'p1', label: 'NRP-WEB · Nilgiri Retail web rebuild' }, { id: 'p2', label: 'INT · Internal tools' }],
  clients: [{ id: 'c1', name: 'Nilgiri Retail' }],
  rows: [
    { person: 'Priya Nair', project: 'NRP-WEB', week: '2026-11-16', billable: 36, nonBillable: 4, approved: 40 },
    { person: 'Priya Nair', project: 'NRP-WEB', week: '2026-11-23', billable: 32, nonBillable: 8, approved: 0 },
    { person: 'Rohit Bhat', project: 'INT', week: '2026-11-16', billable: 0, nonBillable: 20, approved: 18 },
  ],
};
export const BY_TASK: HoursReportData = {
  ...BY_PERSON,
  kind: 'task',
  rows: [
    { project: 'NRP-WEB', task: 'Build', budget: 1600, booked: 1500, approved: 1420 },
    { project: 'NRP-WEB', task: 'Testing', budget: 600, booked: 480, approved: 480 },
    { project: 'INT', task: 'No task', budget: null, booked: 12, approved: 0 },
  ],
};
const live = (over: Partial<LiveHoursReports> = {}): LiveHoursReports => ({ state: 'ready', kind: 'person', onKind: () => {}, filters: { from: '2026-09-07', to: '2026-11-27', projectId: null, clientId: null }, onFilters: () => {}, data: BY_PERSON, onExport: async () => {}, ...over });

export const ByPerson: S = { name: 'Hours by person · all projects (reporting key)', render: () => <HoursReportsScreen live={live()} /> };
export const ByTask: S = { name: 'Hours by task · budget, booked, approved', render: () => <HoursReportsScreen live={live({ kind: 'task', data: BY_TASK })} /> };
export const MineOnly: S = { name: 'Project manager · own projects only', render: () => <HoursReportsScreen live={live({ data: { ...BY_PERSON, scope: 'mine' } })} /> };
export const Empty: S = { name: 'No hours for these filters', render: () => <HoursReportsScreen live={live({ data: { ...BY_PERSON, rows: [] } })} /> };
export const Loading: S = { name: 'Loading', render: () => <HoursReportsScreen live={live({ state: 'loading', data: null })} /> };
export const Error: S = { name: 'Error', render: () => <HoursReportsScreen live={live({ state: 'error', data: null })} /> };
export const NoAccess: S = { name: 'No access (not a project manager, no reporting key)', render: () => <HoursReportsScreen live={live({ state: 'no-access', data: null })} /> };
