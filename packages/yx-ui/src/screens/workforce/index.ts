// People core (P01 §4.4–4.5a; M01 §3.2–3.4, §3.10): directory, org chart, team, probation and bulk changes.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { DirectoryScreen, type DirectoryScreenProps } from './directory';
export { OrgChartScreen, type OrgChartScreenProps } from './org-chart';
export { TeamScreen, type TeamScreenProps } from './team';
export { ProbationScreen, type ProbationScreenProps } from './probation';
export { BulkChangesScreen, BULK_TEMPLATE_COLUMNS, type BulkChangesScreenProps } from './bulk';
export { csvCell, csvText } from './workforce-kit';
