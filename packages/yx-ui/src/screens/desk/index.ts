// Service Desk (M14 phase 3b-1): help centre, agent tickets, ticket workspace, desk set-up.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { HelpCentreScreen, MyTicketScreen, FileList, BannerList, HelpDrawer, type HelpCentreProps, type MyTicketScreenProps, type HelpDrawerProps } from './help';
export { DeskTicketsScreen, BUILT_IN_VIEWS, type DeskTicketsScreenProps, type TicketQuery } from './tickets';
export { TicketScreen, eventText, type TicketScreenProps } from './ticket';
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
export type { HelpKbProps } from './help';
// Batch 4: YukthiX support
export { YukthixSupportScreen, YX_SEVERITY, severityWords, type YukthixSupportScreenProps, type YxSupportRow, type YxSupportTicket, type YxSupportRaise } from './yukthix-support';
// Batch 4: knowledge
export { KnowledgeScreen, categoryTree, AUDIENCE_LABEL, ARTICLE_STATE_LABEL, VERSION_STATE_LABEL, type KnowledgeScreenProps } from './knowledge';
export * from './kb-types';
// Batch 4: reports
export { ReportsScreen, WallScreen, Tile, REPORT_COLUMNS, numText, npsText, type ReportsScreenProps, type ReportsTab } from './reports';
export * from './report-types';
// Batch 4: standalone and privacy
export { PeopleListScreen, ScimTokenBox, type PeopleListScreenProps, type DeskPerson, type PersonInput, type ImportResult, type DirectorySource, type DirectorySourceInput, type GroupMapRow, type GroupRole } from './people-list';
export { PrivacyScreen, type PrivacyScreenProps, type PrivacyRequestRow, type PrivacySettings, type PrivacyStatus } from './privacy';
export { SetupStart, KnownIssuesScreen, DeskSignUpScreen, presetPolicy, PRESETS, WHATS_NEW, type SetupStartProps, type SetupChecklist, type ChecklistStep, type TargetPreset, type KnownIssuesScreenProps, type DeskSignUpScreenProps, type DeskSignUpInput } from './setup-start';
export { InsertArticleButton, TicketKbCard, articleLinkHtml, type ArticleOption, type TicketArticleLink, type TicketKbCardProps } from './ticket-kb';
