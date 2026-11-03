import type { CustomReport, Kpi, ReportDashboard, Survey, WallData } from './report-types';

// Sample reports data for stories and tests (Kaveri Foods).

export const REPORT_DASHBOARD: ReportDashboard = {
  backlog: 42,
  unassigned: 7,
  created: 318,
  solved: 296,
  ageing: { day: 18, threeDays: 12, week: 8, older: 4 },
  mttaHours: 1.4,
  mttrHours: 19.6,
  firstResponseHours: 2.1,
  slaMetPct: 91.5,
  fcrPct: 63.2,
  csatPct: 88,
  csatAverage: 4.4,
  ratings: 125,
  selfService: { solved: 37, views: 812, searches: 1290 },
  agents: [
    { userId: 'u1', name: 'Suresh Pillai', solved: 88, open: 9, resolutionHours: 14.2, rating: 4.6 },
    { userId: 'u2', name: 'Farah Khan', solved: 71, open: 12, resolutionHours: 22.8, rating: 4.1 },
  ],
};

const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-09-${String(9 + i).padStart(2, '0')}`);

export const KPIS: Kpi[] = [
  { metric: 'sla_met_pct', label: 'Response targets met (%)', higherIsBetter: true, target: 95, amber: 90, latest: { day: '2026-10-07', value: 92.4, rag: 'amber' }, points: days(14).map((day, i) => ({ day, value: 88 + (i % 5), rag: 'amber' as const })), forecast: [92.5, 92.8, 93, 93.2, 93.5, 93.7, 94] },
  { metric: 'backlog', label: 'Open tickets at day end', higherIsBetter: false, target: 50, amber: 70, latest: { day: '2026-10-07', value: 42, rag: 'green' }, points: days(14).map((day, i) => ({ day, value: 60 - i, rag: 'green' as const })), forecast: [41, 40, 39, 38, 37, 36, 35] },
  { metric: 'csat_pct', label: 'Happy ratings (%)', higherIsBetter: true, target: null, amber: null, latest: { day: '2026-10-07', value: 88, rag: null }, points: days(6).map((day, i) => ({ day, value: 85 + i, rag: null })), forecast: [] },
];

export const CUSTOM_REPORTS: CustomReport[] = [
  {
    id: 'r1',
    name: 'Open P1 and P2 tickets',
    columns: ['number', 'subject', 'priority', 'assignee', 'created'],
    filters: { states: ['new', 'open'], priorities: [1, 2] },
    shared: true,
    mine: true,
    version: 2,
    schedules: [{ id: 's1', frequency: 'weekly', recipients: ['u1', 'u2'], nextRunAt: '2026-10-12T01:30:00Z', lastRunAt: '2026-10-05T01:30:00Z', lastResult: 'Sent to 2 of 2', active: true }],
  },
  { id: 'r2', name: 'Payroll tickets this month', columns: ['number', 'status', 'category'], filters: { days: 30 }, shared: true, mine: false, version: 1, schedules: [] },
];

export const SURVEYS: Survey[] = [
  { id: 'sv1', deskId: 'd-cs', name: 'Quarterly NPS', question: 'How likely are you to recommend us to a friend or colleague?', everyDays: 90, periodDays: 180, nextRunAt: '2026-11-01T03:30:00Z', lastRunAt: '2026-08-01T03:30:00Z', active: true, version: 3, sent: 240, answered: 96, nps: 32, promoters: 48, passives: 31, detractors: 17 },
];

export const WALL: WallData = {
  name: 'IT floor TV',
  at: '2026-10-08T09:42:00Z',
  desks: [
    { name: 'IT help desk', open: 42, unassigned: 7, urgent: 2, solvedToday: 19, dueWithinHour: 3, late: 1 },
    { name: 'Customer support', open: 18, unassigned: 0, urgent: 0, solvedToday: 11, dueWithinHour: 0, late: 0 },
  ],
};
