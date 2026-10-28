// People core (P01 §4.4–4.5a; M01 §3.3): bulk changes. Directory, org chart, My team and probation are the designed
// PPL screens (@yukthix/ui/frame).
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { BulkChangesScreen, BULK_TEMPLATE_COLUMNS, type BulkChangesScreenProps } from './bulk';
export { csvCell, csvText, downloadText } from './workforce-kit';
