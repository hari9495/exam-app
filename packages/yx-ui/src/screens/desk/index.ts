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
export { PortalScreen, PortalSignIn, PortalHomeView, PortalTicketView, type PortalScreenProps } from './portal';
export { ReadingAidsCard, ReadingAidsFrame, useReadingAids, type ReadingAidsValue } from './reading-aids';
