// Shapes of the reports and survey API (apps/api/src/service-desk/reports.service.ts, surveys.service.ts). Numbers only.

export type Rag = 'green' | 'amber' | 'red';

export interface ReportPeriod {
  /** null: every desk I report on. */
  deskId: string | null;
  /** YYYY-MM-DD */
  from: string;
  to: string;
}

export interface ReportDashboard {
  backlog: number;
  unassigned: number;
  created: number;
  solved: number;
  ageing: { day: number; threeDays: number; week: number; older: number };
  mttaHours: number | null;
  mttrHours: number | null;
  firstResponseHours: number | null;
  slaMetPct: number | null;
  fcrPct: number | null;
  csatPct: number | null;
  csatAverage: number | null;
  ratings: number;
  selfService: { solved: number; views: number; searches: number };
  agents: { userId: string; name: string; solved: number; open: number; resolutionHours: number | null; rating: number | null }[];
}

export interface KpiPoint {
  day: string;
  value: number;
  rag: Rag | null;
}

export interface Kpi {
  metric: string;
  label: string;
  higherIsBetter: boolean;
  target: number | null;
  amber: number | null;
  latest: KpiPoint | null;
  points: KpiPoint[];
  /** The next 7 days, a straight line from the last 14 points (empty with fewer than 3). */
  forecast: number[];
}

export interface LibraryReport {
  key: string;
  practice: string;
  name: string;
}

export interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

export interface ReportFilters {
  deskIds?: string[];
  states?: string[];
  priorities?: number[];
  categoryIds?: string[];
  days?: number;
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface ReportSchedule {
  id: string;
  frequency: ScheduleFrequency;
  recipients: string[];
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastResult: string | null;
  active: boolean;
}

export interface CustomReport {
  id: string;
  name: string;
  columns: string[];
  filters: ReportFilters;
  shared: boolean;
  mine: boolean;
  version: number;
  schedules: ReportSchedule[];
}

export interface CustomReportInput {
  name: string;
  columns: string[];
  filters: ReportFilters;
  shared: boolean;
}

export interface Wallboard {
  id: string;
  name: string;
  deskIds: string[];
  backlogAlert: number | null;
  createdAt: string;
}

export interface WallboardInput {
  name: string;
  deskIds: string[];
  backlogAlert?: number;
}

export interface CustomerMonthReport {
  account: string;
  month: string;
  tickets: number;
  lines: { measure: string; severity: number; kept: number; missed: number }[];
}

export interface WallDesk {
  name: string;
  open: number;
  unassigned: number;
  urgent: number;
  solvedToday: number;
  dueWithinHour: number;
  late: number;
}

export interface WallData {
  name: string;
  at: string;
  desks: WallDesk[];
}

export interface Survey {
  id: string;
  deskId: string;
  name: string;
  question: string;
  everyDays: number;
  periodDays: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  active: boolean;
  version: number;
  sent: number;
  answered: number;
  nps: number | null;
  promoters: number;
  passives: number;
  detractors: number;
}

export interface SurveyInput {
  deskId: string;
  name: string;
  question: string;
  everyDays: number;
  periodDays: number;
  startAt?: string;
  active: boolean;
}

export interface SurveyAnswer {
  score: number;
  comment: string | null;
  account: string | null;
  at: string;
}

export interface UserHit {
  id: string;
  name: string | null;
  email: string;
}
