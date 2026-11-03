// Service Desk (M14 phase 3b-1): help centre, agent tickets, ticket workspace, desk set-up.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { MyTicketScreen, FileList, BannerList, HelpDrawer, type MyTicketScreenProps, type HelpDrawerProps } from './help';
// HLP-01 Help centre: the designed screen with `live` (Helpdesk design wiring, round 1).
export { HelpCentreScreen } from '../ops/helpdesk';
export { topicOptions, rateCandidate, type LiveHelp } from '../ops/helpdesk-live';
// HLP-02 Agent desk: the designed screen with `live` (Helpdesk design wiring, round 2).
export { AgentDeskScreen } from '../ops/helpdesk';
export { BUILT_IN_VIEWS, toFilters, type TicketQuery, type LiveAgentDesk, type BulkAction, type BulkResult } from '../ops/helpdesk-desk-live';
export { eventText } from './ticket';
// HLP-03 Ticket workspace: the designed screen with `live` (Helpdesk design wiring, round 3).
export { TicketWorkspaceScreen } from '../ops/helpdesk';
export { activityOf, type LiveTicket } from '../ops/helpdesk-ticket-live';
// HLP-05 SLA dashboard: the designed screen with `live` (Helpdesk design wiring)
export { SlaDashboardScreen } from '../ops/helpdesk';
export { REPORT_COLUMNS, numText, npsText, type LiveSla, type SlaReportTab, type SlaDays } from '../ops/helpdesk-sla-live';
export { DeskSetupScreen, type DeskSetupScreenProps } from './setup';
export { DeskPage, STATE_LABEL, PRIORITY_LABEL, OPEN_STATES, fillCanned, minutesText, when, browserTimeZone, CopyValue } from './desk-kit';
export { TicketWorkRail, SlaCard, TasksCard, FamilyCard, SideCard, RemindCard, MaskedCard, ResolveDialog, EscalateDialog, TaskListCard, type TicketWorkProps } from './work';
export { SlaTab, WorkSetupTab, DuplicatesCard, type SlaTabProps, type WorkSetupProps, type PolicyInput } from './setup-sla';
export { MyCalendarScreen, type MyCalendarScreenProps } from './calendar';
// Batch 3 (SD-1.18 to SD-1.23, SD-1.28): email, help pages, banners, customers, the outside portal, reading aids.
export { EmailTab, PortalTab, BannersTab, SecretBox, checksText, KIND_LABEL, type EmailSetupProps, type PortalSetupProps, type BannerSetupProps } from './setup-channels';
export { CustomersScreen, planText, type CustomersScreenProps } from './customers';
export { PortalScreen, PortalSignIn, PortalHomeView, PortalTicketView, PrivacyRequestCard, type PortalScreenProps, type PortalKbProps } from './portal';
export { ReadingAidsCard, ReadingAidsFrame, useReadingAids, type ReadingAidsValue } from './reading-aids';
// Batch 4: the requester's help articles, suggestions while typing and ratings (SD-1.24 to SD-1.26).
export { ArticleBody, ArticleDrawer, KnowledgeCard, RateTicketCard, SuggestList, useSuggestions, LANGUAGE_LABEL, type KbArticleView, type KbHome, type KbSuggestion, type ArticleBodyProps } from './help-kb';
// Batch 4: YukthiX support
export { YukthixSupportScreen, YX_SEVERITY, severityWords, type YukthixSupportScreenProps, type YxSupportRow, type YxSupportTicket, type YxSupportRaise } from './yukthix-support';
// HLP-04 Knowledge base editor: the designed screen with `live` (Helpdesk design wiring, round 4).
export { KbEditorScreen } from '../ops/helpdesk';
export { categoryTree, articleStatus, AUDIENCE_LABEL, ARTICLE_STATE_LABEL, VERSION_STATE_LABEL, type LiveKb } from '../ops/helpdesk-kb-live';
export * from './kb-types';
// HLP-06 Speak-up filing: the designed screens with `live`, and the set-up of who receives reports.
export { SpeakUpScreen, CheckReportScreen } from '../ops/cases';
export { SpeakUpSetupScreen, anonymousFor, type LiveSpeakUp, type LiveCheckReport, type LiveSpeakUpSetup, type SpeakUpFormData, type SpeakUpInput, type FiledReport, type ReporterView, type SpeakUpSetupData, type SpeakUpTeam } from '../ops/helpdesk-speakup-live';
// HLP-07 My cases, HLP-08 Cases (case team), HLP-09 Ethics desk: the designed screens with `live`.
export { MyCasesScreen, CaseListScreen, CaseWorkspaceScreen, EthicsDeskScreen } from '../ops/cases';
export { KIND_LABEL as CASE_KIND_LABEL, type LiveMyCases, type LiveCaseList, type LiveCaseWorkspace, type LiveEthicsDesk, type CaseTab } from '../ops/cases-live';
export type { MyCaseRow, MyCaseDetail, CaseListRow, CaseDetail, EthicsRow, NoticeInput, ProposeInput, IcReportInput, ReliefInput, AddMemberInput, MyReplyInput } from '../ops/cases-live-types';
// HLP-12 Accident case: the designed workspace and report with `live`.
export { AccidentWorkspaceScreen, ReportAccidentScreen } from '../ops/cases-more';
export type { LiveAccidentWorkspace, LiveReportAccident, AccidentDetail, AccidentManagerView, AccidentFormData, AccidentReportInput, AccidentFacts, EcInput as AccidentEcInput, EsicFormView, MedicalKind, AccidentDialog } from '../ops/accident-live';
// HLP-10 Policy library + acknowledgement and HLP-11 Policy admin: the designed screens with `live`.
export { PolicyLibraryScreen, PolicyAdminScreen } from '../ops/helpdesk';
export { METHOD_LABEL, VERSION_LABEL, type LivePolicyLibrary, type LivePolicyAdmin, type PolicyAdminTab } from '../ops/helpdesk-policy-live';
export * from './policy-types';
// Batch 4: reports
export { WallScreen } from './reports';
export * from './report-types';
// Batch 4: standalone and privacy
export { PeopleListScreen, ScimTokenBox, type PeopleListScreenProps, type DeskPerson, type PersonInput, type ImportResult, type DirectorySource, type DirectorySourceInput, type GroupMapRow, type GroupRole } from './people-list';
export { PrivacyScreen, type PrivacyScreenProps, type PrivacyRequestRow, type PrivacySettings, type PrivacyStatus } from './privacy';
export { SetupStart, KnownIssuesScreen, DeskSignUpScreen, presetPolicy, PRESETS, WHATS_NEW, type SetupStartProps, type SetupChecklist, type ChecklistStep, type TargetPreset, type KnownIssuesScreenProps, type DeskSignUpScreenProps, type DeskSignUpInput } from './setup-start';
export { InsertArticleButton, TicketKbCard, articleLinkHtml, type ArticleOption, type TicketArticleLink, type TicketKbCardProps } from './ticket-kb';
// Phase 3b-2 batch 1 (SD-2.01 … SD-2.05, SD-2.12): catalogue, cart, order guides, approvals (P03), desk rules (P19).
export * from './esm-types';
export { CatalogScreen, RequestTracker, LANGS, type CatalogScreenProps } from './catalog';
export { ServiceForm, LivePicker, ChoiceLabel, type ServiceFormProps } from './service-form';
export { CatalogAdmin, FormBuilder, type CatalogAdminProps } from './catalog-admin';
export { RulesAdmin, type RulesAdminProps } from './rules-admin';
export { RequestPanel } from './request-panel';
export { resolveForm, answersToSend, formProblems, toServerGroup, fromServerGroup, inLang, EMPTY_FORM, COLOUR_TONE, type FormDef, type FormFieldDef, type FormSectionDef, type FormLang, type Answers, type AnswerValue, type ServerGroup } from '../../lib/forms';
// Phase 3b-2 batch 2 (SD-2.06 … SD-2.11, SD-2.13, SD-2.17 … SD-2.19).
export * from './esm2-types';
export { ChatWindow, RequesterChatScreen, AgentChatScreen, ChatPromptBanner, type ChatLive, type RequesterChatProps, type AgentChatProps } from './chat';
export { TicketEsmRail, HrSummaryCard, MyDocumentsCard, ActionLinkScreen, ChannelLinksCard, LifecycleAdmin, SchedulesAdmin, ChatQueuesAdmin, DeskOrgAdmin, type TicketEsmRailProps, type LifecycleAdminProps, type SchedulesAdminProps, type DeskOrgAdminProps } from './esm2';
// Phase 3b-2 batch 3 (SD-2.20 … SD-2.27).
export * from './esm3-types';
export { MessagingAdmin, MyChannelsCard, TeamScreen, KIND_LABEL as MSG_KIND_LABEL, PRESENCE_LABEL, type MessagingAdminProps, type MyChannelsCardProps, type TeamScreenProps } from './esm3';
