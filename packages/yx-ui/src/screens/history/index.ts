// People › job history and changes (P06 §7). Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { PersonHistoryScreen, type PersonHistoryScreenProps } from './person-history';
export { JobChangesScreen, type ChangesView, type JobChangesScreenProps } from './job-changes';
export { ChangeDrawer, ImpactPanel, TYPE_LABEL, changeInput, type ChangeDraft, type ChangeDrawerProps } from './history-kit';
export { HireDrawer, hireInput, EMPTY_HIRE, type HireDraft, type HireDrawerProps, type HireInput } from './hire';
