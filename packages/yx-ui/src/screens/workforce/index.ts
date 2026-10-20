// People core (P01 §4.4–4.5a; M01 §3.2–3.4, §3.10): org chart, team, probation and bulk changes (the directory is the
// designed PPL-01 screen, @yukthix/ui/frame).
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { OrgChartScreen, type OrgChartScreenProps } from './org-chart';
export { TeamScreen, type TeamScreenProps } from './team';
export { ProbationScreen, type ProbationScreenProps } from './probation';
export { BulkChangesScreen, BULK_TEMPLATE_COLUMNS, type BulkChangesScreenProps } from './bulk';
export { csvCell, csvText, downloadText } from './workforce-kit';
