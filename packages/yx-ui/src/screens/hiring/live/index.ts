// Recruitment (M10), wired to the hiring API (M10-BUILD-DESIGN). Batch AT1: the jobs list.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
// HIR-01: the designed headcount plan board, live with its `live` prop (the stand-in is gone).
export { HeadcountPlanScreen, PlanEditorDrawer, type LiveHeadcountPlan, type LivePlan, type LivePlanLine, type PlanInput as HeadcountPlanInput, type PlanChoice } from '../hiring-plan';
export { ApprovalRoutesScreen, type ApprovalRoutesScreenProps } from './routes';
export { JobBoardsScreen, type JobBoardsScreenProps } from './boards';
// T9-09 careers site and the candidate pages outside the app (founder decisions 8 and 10), live with their `live` prop.
export { CareersJobScreen, CareersSiteScreen, type CareersJobDetail, type LiveCareersJob, type LiveCareersSite } from '../../portals/t9-candidate';
export {
  ApplicationStatusScreen,
  CandidatePortalScreen,
  InterviewBookingScreen,
  OfferAcceptScreen,
  type ApplicationStatusView,
  type CandidateBrand,
  type CandidatePageState,
  type CandidatePortalView,
  type InterviewView as CandidateInterviewView,
  type LiveCandidatePortal,
  type LiveInterviewBooking,
  type LiveOfferAccept,
  type OfferView,
  type PortalApplication as CandidatePortalApplication,
  type PortalOpenJob as CandidatePortalOpenJob,
} from '../../portals/t9-09-candidate-pages';
// HIR-05: the designed candidate record, merge, candidate list and retention, live with their `live` prop.
export { EmailDialog, STAGE } from '../candidate-dialogs';
export { CandidateRecordScreen, MergeDrawer, type DobInput, type LiveCandidateRecord, type LiveDuplicate, type LiveMergeDrawer, type MergeFieldRow } from '../hiring-pipeline';
export { CandidateListScreen, CandidateRetentionScreen, type CandidateListTab, type CandidateStatusFilter, type DataRequestMatch, type LiveCandidateList, type LiveRetention } from '../hiring-candidates';
// HIR-04 follow-ups (answer 261): the Bulk actions and Add candidate sheets on the board, the job settings on the HIR-03
// workspace, and the application on the HIR-05 record (the old candidates list and application panel are gone).
export { AddCandidateSheet, BulkActionsSheet, RejectDialog, scorecardText, type AddCandidateInput, type BulkRow } from '../pipeline-sheets';
export { ApplicationDrawer, ScheduleDialog, type ApplicationDrawerProps, type ScheduleDialogProps } from '../candidate-application';
// HIR-09 / HIR-29: the designed offer builder and offer record (with its conditions tab), live with their `live` prop.
export { BulkOfferScreen, OfferBuilderScreen, OfferConditionsTab, OfferRecordScreen, type LiveConditions, type OfferBuilderProps, type OfferRecordProps } from '../hiring-offers';
export { JobSettingsPanel, StageTargetsSheet, type LiveJobSettings, type StageTarget, type StageTargetChange, type JobSettingsPatch } from '../job-settings';
// HIR-06 / HIR-07: the designed interview calendar and scorecard form, live with their `live` prop (stand-ins gone).
export { BulkInterviewDayScreen, InterviewCalendarScreen, ScorecardScreen, type LiveInterviewCalendar, type LiveScorecard } from '../hiring-pipeline';
// HIR-25: the designed notetaker card (inside the scorecard page) and the draft scorecard review, live.
export { DraftScorecardReview, NotetakerConsentPanel, type DraftRating, type LiveDraftReview, type NotetakerControls, type Participant } from '../hiring-pipeline';
// Settings 6.1 shows templates read-only; this old page stays until template editing is drawn (answer 345).
export { ScorecardTemplateSheet, asPerCent, type ScorecardTemplateSheetProps } from '../scorecard-template-sheet';
// HIR-11 and HIR-12: the designed screens themselves (hiring-plan.tsx), made live with their `live` prop.
export { AllReferralsScreen, RecruitingCostsScreen, ReferralsScreen, type AllReferral, type LiveAllReferrals, type CostEntry, type CostInput, type LiveRecruitingCosts, type LiveReferrals, type ReferInput, type ReferJob, type Referral } from '../hiring-plan';
// HIR-13: the designed internal jobs page (hiring-plan.tsx), live with its `live` prop (the phone view stays a story).
export { InternalJobsScreen, type InternalApplication, type InternalApplyInput, type LiveInternalJobs } from '../hiring-plan';
// HIR-02 and HIR-26: the designed requisitions list and rediscovery panel (hiring-plan.tsx), made live with `live`.
export { RediscoveryPanel, RequisitionsScreen, type LiveRediscovery, type LiveRequisitionRow, type LiveRequisitions, type RediscoveryMatch } from '../hiring-plan';
// HIR-04: the designed pipeline board itself, live with its `live` prop (the stand-in board is gone).
export { PipelineBoardScreen, type LivePipelineBoard, type LivePipelineCard, type LivePipelineStage } from '../hiring-pipeline';
export type { Score as PipelineScore } from '../hiring-kit';
// Settings 6.1 Hiring: the designed settings page made live with `live` (founder answers 291 and 302).
export { SettingsGroupScreen, SettingsHomeScreen, SettingsPageScreen, type LiveSettingsNav, type LiveSettingsPage } from '../../settings/settings-screens';
export { SETTINGS_GROUPS } from '../../settings/settings-groups';
export { hiringSettingsPage, hiringSettingsChanges, type HiringSettingsData } from '../../settings/hiring-live';
// HIR-10 and HIR-20: the designed BGV tracker and Talent CRM (hiring-offers.tsx), live with their `live` prop (the
// pools stand-in is gone).
export { BgvTrackerScreen, TalentCrmScreen, type BgvResultInput, type LiveBgv, type LiveBgvCheck, type LiveBgvJoiner, type LivePool, type LivePoolMember, type LivePostingJob, type LiveTalentCrm, type LiveCrm } from '../hiring-offers';
export type { CampaignView, CampaignPerson, EngagementView, AudienceCount, SequenceDraft, SourcedRow, SourcedInput } from '../hiring-crm';
// HIR-27 bulk interview day.
export { InterviewDaySheet, type InterviewDayInput, type InterviewDaySheetProps, type InterviewDayView, type LiveInterviewDay } from '../interview-day';
// Staffing desk slice 1 (HIR-14, HIR-15, Settings 6.2).
export { ClientsScreen, ClientWorkspaceScreen, RateCardScreen, type ClientRowView, type ClientView, type ContactView, type LiveClients, type LiveClientWorkspace, type LiveRateCard, type RateChangeInput, type RateRowView } from '../hiring-staffing';
export { ClientSheet, ContactSheet, InvoiceSeriesSheet, RateLineSheet, type ClientInput, type ContactInput, type InvoiceSeriesInput, type RateLineInput } from '../staffing-sheets';
export { staffingSettingsPage, staffingSettingsChanges, staffingEntityChanges, type StaffingSettingsData } from '../../settings/staffing-live';
// HIR-23: the designed bias audit record, live with its `live` prop.
export { BiasAuditScreen, type BiasAuditInput, type LiveBiasAudit } from '../hiring-offers';
export type { AuditCategory } from '../hiring-logic';
// Staffing desk slice 2 (HIR-16 submissions, HIR-17 placements and bench, HIR-21 vendors).
export { BenchBoardScreen, PlacementRecordScreen, PlacementsScreen, SubmissionsBoardScreen, VendorsScreen, type BenchRowView, type LiveBench, type LivePlacementRecord, type LivePlacements, type LiveSubmissions, type LiveVendors, type PlacementEndInput, type PlacementExtendInput, type PlacementRowView, type SubmissionRowView, type SubmissionStage, type VendorRowView, type VendorSubmissionView } from '../hiring-staffing';
export { BenchSheet, ClientJobSheet, PlacementSheet, ShareJobSheet, SubmitToClientSheet, VendorSheet, type BenchInput, type ClientJobInput, type PlaceableRow, type VendorLinks, type PlacementInput, type ShareInput, type ShareOptions, type SubmitInput, type SubmitOptions, type SubmitPerson, type VendorInput } from '../staffing-sheets';
// Staffing desk slice 3 (HIR-18 invoices and vendor invoices, HIR-19 receivables, HIR-30 fees, HIR-31 the e-invoice
// window, T9-06 the client portal per contact).
export { CollectionsScreen, InvoiceRecordScreen, InvoicesScreen, LiveEInvoiceBanner, PlacementFeeSettingsScreen, type FeeTermsInput, type FeeTermsView, type HoursRowView, type InvoiceDetail, type InvoiceRowView, type LedgerRowView, type LiveCollections, type LiveFeeTerms, type LiveHours, type LiveInvoiceRecord, type LiveInvoices, type ReceiptInput, type VendorBillView, type WindowView } from '../hiring-staffing';
export { CreateInvoicesSheet, ExportSheet, type DraftInput, type ExportInput, type ExportOptions, type InvoiceOptions } from '../staffing-sheets';
// Round 4 (answers 491-499): the placement fee card and its live shape.
export { PlacementFee, type LivePlacementFee } from '../hiring-staffing';
export { ClientPortalScreen, type LiveClientPortal, type LiveClientTab } from '../../portals/t9-business';
export { PortalSignInScreen } from '../../portals/portals-kit';
export type { SettingsGroupDef } from '../../settings/settings-types';
// Settings S-2 (answers 1323, 1324): the Time & Leave pages with the company's settings.
export { TIME_SETTINGS, timeSettingsChanges, timeSettingsPage, type RegistryDef, type TimeSettingsData } from '../../settings/time-settings-live';
export { TIME_REGISTRY_SAMPLE } from '../../settings/time-settings-sample';
