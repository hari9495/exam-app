// Assessments AS-1 (answers 2009, 2010, 2017): the designed question bank screens, live with their `live` prop.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export { ItemAnalysisScreen, QuestionBankScreen, QuestionEditorScreen, QuestionReviewQueueScreen } from './bank-tests';
export {
  LANGUAGE_NAME,
  STATUS_LABEL,
  TYPE_LABEL,
  missingAlt,
  type BankContent,
  type BankLanguage,
  type BankLoad,
  type BankQuestion,
  type BankRow,
  type BankSettings,
  type BankStatus,
  type BankTranslation,
  type ItemRow,
  type ItemStats,
  type LiveBank,
  type LiveEditor,
  type LiveItemAnalysis,
  type LiveReviews,
  type ReviewChange,
  type ReviewTranslation,
} from './bank-live';

// Assessments AS-4a (PRC-26, PRC-27): the designed test runner and result page, live with their `live` prop.
export { ResultAppealScreen, TestRunnerScreen, type LiveResult, type LiveRunner, type LiveRunnerQuestion } from './candidate';
