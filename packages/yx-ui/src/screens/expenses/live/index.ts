// Expenses (M05), wired to the API (M05-BUILD-DESIGN §19). Batch E1: Settings › Expenses (EXP-07 and set-up).
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { ExpenseSetupScreen, type ExpenseSetupScreenProps, type CategoryInput, type TierInput } from './setup';
export { fromRows, toRows, sameRules, type MatrixRow, type Per } from './matrix';
