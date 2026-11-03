// Sample `live` data for the HLP-05 stories of states the real SLA dashboard and desk reports have, and for the tests.
// Not used by the app.
import { CS_DESK, DESK } from '../desk/data';
import { CUSTOM_REPORTS, KPIS, REPORT_DASHBOARD, SURVEYS } from '../desk/report-data';
import type { SlaDashboard } from '../desk/report-types';
import type { LiveSla } from './helpdesk-sla-live';

export const SLA: SlaDashboard = {
  from: '2026-10-05',
  to: '2026-11-03',
  open: 42,
  breachedNow: 2,
  atRiskCount: 4,
  atRiskHidden: 1,
  firstResponseMetPct: 94.2,
  firstResponseMetPctBefore: 89,
  articlePct: 10.4,
  articlePctBefore: 8.1,
  resolutionTarget: 90,
  queues: [
    { deskId: 'd-cs', name: 'Customer support', met: 61, breached: 4 },
    { deskId: 'd-it', name: 'IT help desk', met: 72, breached: 3 },
  ],
  weeks: [
    { week: '2026-09-28', metPct: 88.2 },
    { week: '2026-10-05', metPct: 90.1 },
    { week: '2026-10-12', metPct: 86.4 },
    { week: '2026-10-19', metPct: 91.3 },
    { week: '2026-10-26', metPct: 93 },
    { week: '2026-11-02', metPct: null },
  ],
  firstResponseWeeks: [
    { week: '2026-09-28', metPct: 88 },
    { week: '2026-10-05', metPct: 89 },
    { week: '2026-10-12', metPct: 91 },
    { week: '2026-10-19', metPct: 92 },
    { week: '2026-10-26', metPct: 94 },
    { week: '2026-11-02', metPct: null },
  ],
  agents: [
    { userId: 'u2', name: 'Farah Khan', desks: 'IT help desk', open: 12, atRisk: 2, rating: 4.1 },
    { userId: 'u1', name: 'Suresh Pillai', desks: 'IT help desk, Customer support', open: 9, atRisk: 1, rating: 4.6 },
  ],
  atRisk: [
    { id: 't2', number: 'IT-1002', subject: 'Laptop will not start', deskId: 'd-it', deskName: 'IT help desk', priority: 1, assignee: { id: 'u2', name: 'Farah Khan' }, resolution: { usedMinutes: 300, targetMinutes: 240, paused: false } },
    { id: 't7', number: 'CS-0412', subject: 'Invoice copy for September', deskId: 'd-cs', deskName: 'Customer support', priority: 3, assignee: null, resolution: { usedMinutes: 1010, targetMinutes: 960, paused: false } },
    { id: 't1', number: 'IT-1001', subject: 'VPN drops every ten minutes', deskId: 'd-it', deskName: 'IT help desk', priority: 2, assignee: { id: 'u1', name: 'Suresh Pillai' }, resolution: { usedMinutes: 420, targetMinutes: 480, paused: false } },
  ],
};

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 300));

/** Every prop filled, for stories and tests to override. */
export const liveSla = (over: Partial<LiveSla> = {}): LiveSla => ({
  state: 'ready',
  onRetry: () => {},
  canView: true,
  canManage: true,
  canSurveys: true,
  canCustomers: true,
  canAssign: true,
  desks: [DESK, CS_DESK],
  tab: 'sla',
  onTab: () => {},
  tabState: 'ready',
  onRetryTab: () => {},
  days: '30',
  onDays: () => {},
  deskId: null,
  onDesk: () => {},
  ticketsHref: '#tickets',
  sla: SLA,
  onExport: () => wait(undefined),
  onOpenTicket: () => {},
  onLoadTeam: () => wait([{ userId: 'u1', name: 'Suresh Pillai' }, { userId: 'u2', name: 'Farah Khan' }]),
  onReassign: () => wait(undefined),
  dashboard: REPORT_DASHBOARD,
  kpis: KPIS,
  onSetTarget: () => wait(undefined),
  library: [
    { key: 'by_status', practice: 'Incidents and requests', name: 'Tickets by status' },
    { key: 'sla', practice: 'SLA', name: 'Response targets met, by desk and priority' },
  ],
  onRunReport: () => wait({ title: 'Tickets by status', columns: ['Status', 'Tickets'], rows: [['Open', 30], ['Waiting', 12]] }),
  onDownloadReport: () => wait(undefined),
  funnel: [
    { key: 'searches', label: 'Searches', count: 1290 },
    { key: 'views', label: 'Articles read', count: 812 },
    { key: 'clicks', label: 'Search results opened', count: 640 },
    { key: 'solved', label: '"This solved it"', count: 37 },
    { key: 'raised', label: 'Tickets raised', count: 318 },
    { key: 'rate', label: 'Self-service rate (%)', count: 10.4 },
  ],
  customReports: CUSTOM_REPORTS,
  onSaveCustom: () => wait(undefined),
  onDeleteCustom: () => wait(undefined),
  onRunCustom: () => wait({ title: 'Open P1 and P2 tickets', columns: ['Number', 'Subject', 'Priority'], rows: [['IT-1001', 'VPN down', 'P1']] }),
  onDownloadCustom: () => wait(undefined),
  onSchedule: () => wait(undefined),
  onEndSchedule: () => wait(undefined),
  onSearchUsers: async () => [{ id: 'u2', name: 'Farah Khan', email: 'farah@kaveri.test' }],
  wallboards: [{ id: 'w1', name: 'IT floor TV', deskIds: ['d-it'], backlogAlert: 60, createdAt: '2026-10-01T05:00:00Z' }],
  onCreateWallboard: () => wait({ id: 'w2', url: 'https://app.yukthix.test/yx/wall/org-1/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG' }),
  onRevokeWallboard: () => wait(undefined),
  accounts: [{ id: 'ac1', name: 'Shakti Retail' }],
  onCustomerReport: () => wait({ account: 'Shakti Retail', month: '2026-09', tickets: 14, lines: [{ measure: 'First reply', severity: 1, kept: 3, missed: 1 }] }),
  surveys: SURVEYS,
  onSaveSurvey: () => wait(undefined),
  onLoadAnswers: () => wait([{ score: 9, comment: 'Quick and kind.', account: 'Shakti Retail', at: '2026-09-20T06:00:00Z' }]),
  ...over,
});
