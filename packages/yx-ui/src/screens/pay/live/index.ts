// Payroll batch 5a, wired to the API (M03 §15, PAY-1.01 … 1.12): pay periods and reopen requests, the audit log with
// record timelines, pay documents (with the public verify page and the alumni / nominee portal) and payroll files.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { monthText } from './periods';
// The public verify page (T9-08), the pay documents portal (T9-02 tabs, nominee page) and its sign-in: designed screens with live paths.
export { VerifyPageScreen, AlumniPortalScreen, NomineePortalScreen, type LiveVerifyPage, type LiveAlumniPortal, type LivePortalDoc } from '../../portals/t9-workforce';
export { PortalSignInScreen, type LiveOtpSignIn } from '../../portals/portals-kit';
// Batch 5b (PAY-2.04 … 2.13): payroll set-up, pay groups, the payslip layout, statutory rules and coverage, imports,
// the component library, salary templates and compensation.
export * from './types-5b';
export { EntityPicker, parseCsv, statuteText } from './setup';
// Batch 5j (PAY-10.01 … 10.04): runs, inputs, the employee's payslips and the compliance screens, wired.
export * from './types-5j';
// Payroll operations (PAY-10.09 … 10.16): payments, loans, payslip queries, tax declarations and proofs, registers,
// advisories, certificates and nominees.
export * from './types-ops';
export { PayslipLines, ReasonDrawer, RunStatusBadge, rupees, runName } from './runs';
export { PersonPicker, type PersonHit, type LopRow, type HoldRow } from './inputs';
// Batch 5h (PAY-8.01 … 8.04): consultants, their invoices and payments, Form 140 / 131 and the consultant's own page.
export * from './types-5h';
export { ConsultantsScreen, ConsultantPortalScreen, type LiveConsultants, type LiveConsultantPortal } from '../consultants';
// Batch 5i (PAY-9.01 … 9.12): special pay, earned wage access, equity, actuarial valuation and country packs.
export * from './types-5i';
export { RunWorkspaceScreen } from '../payroll-run';
export type { LiveRunWorkspaceData } from '../run-workspace-live';
export { PayrollHomeScreen, CoverageMonitorPanel } from '../payroll-run';
export type { LivePayrollHome, LiveCoverage } from '../payroll-home-live';
// PAY-46 audit log, PAY-48 pay documents, PAY-49 pay periods and reopen requests: designed screens with `live`.
export { PayPeriodsScreen, ReopenRequestsScreen, PayAuditScreen, PayDocumentsScreen, actionText, type LivePayPeriods, type LiveReopenRequests, type LivePayAudit, type LivePayDocuments, type NomineeInput } from '../payroll-records';
// PAY-04 … 06 inputs, PAY-19 court orders and recoveries (tabs on the arrears page), PAY-20 payslip queries: designed screens with `live`.
export { LopInputScreen, OneTimePayScreen, SalaryHoldsScreen, QueryQueueScreen, RecoveriesScreen } from '../payroll-inputs';
export type { LiveInputs, LiveQueries, LiveRecoveriesData, LiveCourtOrder, CourtOrderInput } from '../payroll-inputs-live';
// PAY-10 · Payments and files (design with `live`): a run's payments, every payroll file and the payment modes.
export { PaymentsScreen, type PaymentsProps } from '../payroll-inputs';
export { PaymentModesPanel, type LivePayments, type LiveRunPayments, type LivePayrollFiles, type LivePaymentModes, type RunJournal, type JournalFormat, type PaymentModeRequest } from '../payments-live';
export { PayrollSetupScreen } from '../comp-setup';
export type { LivePayrollSetup, SetupStep, SetupLink, GroupInput, GoLiveReadiness, ReadinessItem, ParallelRunView } from '../setup-live';
export { CompensationScreen, TemplateBuilderScreen, ComponentLibraryScreen, PayslipLayoutScreen } from '../comp-setup';
export { type LiveCompensation, type LiveTemplates, type LiveComponentLibrary, type LivePayslipLayout, type SplitSuggestion, type CompensationHistoryItem, type SplitFreshness } from '../comp-setup-live';
export { ArrearsBaseScreen, ActuarialScreen, BonusComputationScreen } from '../offcycle';
export type { LiveArrears, LiveActuarial } from '../offcycle-live';
// PAY-25 payroll reports (design with `live`).
export type { LivePayrollReports, PayReport, PayReportKind, ReportFilters, ReportOptions } from '../reports-live';
// PAY-24 statutory bonus (design with `live`).
export type { LiveBonus, BonusOverview, BonusComputation, BonusRow, BonusRules, BonusYear, BonusChange, BonusRowChange } from '../bonus-live';
export { CountryPacksScreen, type LiveCountryPacks, type W9Input, type WpsIdsInput } from '../country-packs';
export { SpecialPayHomeScreen } from '../special-pay';
export type { LiveSpecialPay, PieceOutput, TipPoolView, UnionRemittance, PieceCheck } from '../special-pay-live';
export { EquityScreen, MyEquityScreen, type LiveEquity, type LiveMyEquity } from '../equity';
// Employee pay and tax designs (PAY-17, 18, 21 … 23, 26, 27, 33, 39 … 41, 54 · builder 3): designed screens with `live`.
export {
  PayslipViewerScreen,
  TaxWorkspaceScreen,
  RegimeCompareScreen,
  LoanRequestScreen,
  EwaRequestScreen,
  IncentiveStatementScreen,
  PayBandScreen,
  MyPayDocumentsScreen,
  payDiff,
  previewEmi,
  monthName,
  subjectText,
  type LivePayslips,
  type PayDiffRow,
  type LiveTax,
  type TaxTab,
  type LiveRegimeCompare,
  type MyTaxWorkspace,
  type RegimeComparison,
  type MyTaxSheet,
  type MyForm12b,
  type Form12bInput,
  type ResidencyInput,
  type LiveLoanRequest,
  type LoanRules,
  type LiveEwaRequest,
  type LiveIncentives,
  type LivePayBand,
  type MyPayBand,
  type LiveMyPayDocuments,
} from '../employee-pay';
export { LoansScreen, ProofQueueScreen, EwaAdminScreen, PayrollReportsScreen, type LiveLoans, type LiveProofQueue, type ProofStatusFilter, type Form12bRow, type ResidencyRow, type LiveEwaAdmin } from '../admin-tax-loans';
// PAY-11 · Off-cycle run (design with `live`): a new off-cycle run, and an off-cycle run's page.
export { OffCycleRunScreen } from '../offcycle';
export type { LiveOffCycleRun } from '../offcycle-run-live';
// PAY-01 · statutory dues and one stage row per pay group (round 2).
export { groupRuns, homeDueItems, type HomeDues } from '../payroll-home-live';
export type { RunInputSources } from '../run-workspace-live';
export type { QueryHandler } from '../payroll-inputs-live';
export type { RepayInput, RepayRoute } from '../payments-live';
// Compliance (CMP-01, 03, 04, 05, 06, 08, 13 · ops/compliance.tsx): designed screens with `live`.
export { StatutoryHubScreen, RegistersScreen, Form16BulkScreen, RulesBrowserScreen, ConsultantTdsScreen, MissingIdsScreen } from '../../ops/compliance';
export type { LiveStatutoryHub, LiveRegisters, LiveForm16, LiveRules, LiveConsultantTds, LiveTdsReturns, LiveChallanSheet, SectionChallan, CertificateImport, LiveMissingIds, CorrectionInput } from '../../ops/compliance-live';
