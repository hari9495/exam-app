// People › job history and changes (P06 §7). Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { PersonHistoryScreen, hoursLabel, serviceDatesInput, type PersonHistoryScreenProps } from './person-history';
export { ReasonDialog, Review as ChangeReview, type ChangeAsk } from './job-changes';
export { ChangeDrawer, ImpactPanel, TYPE_LABEL, changeInput, type ChangeDraft, type ChangeDrawerProps } from './history-kit';
export { HireDrawer, hireInput, EMPTY_HIRE, type HireDraft, type HireDrawerProps, type HireInput } from './hire';
