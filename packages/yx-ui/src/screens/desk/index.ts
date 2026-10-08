// Service Desk (M14 phase 3b-1): help centre, agent tickets, ticket workspace, desk set-up.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { HelpCentreScreen, MyTicketScreen, FileList, type HelpCentreProps, type MyTicketScreenProps } from './help';
export { DeskTicketsScreen, BUILT_IN_VIEWS, type DeskTicketsScreenProps, type TicketQuery } from './tickets';
export { TicketScreen, eventText, type TicketScreenProps } from './ticket';
export { DeskSetupScreen, type DeskSetupScreenProps } from './setup';
export { DeskPage, STATE_LABEL, PRIORITY_LABEL, OPEN_STATES, fillCanned, minutesText, when } from './desk-kit';
export { TicketWorkRail, SlaCard, TasksCard, FamilyCard, SideCard, RemindCard, MaskedCard, ResolveDialog, EscalateDialog, TaskListCard, type TicketWorkProps } from './work';
export { SlaTab, WorkSetupTab, DuplicatesCard, type SlaTabProps, type WorkSetupProps, type PolicyInput } from './setup-sla';
export { MyCalendarScreen, type MyCalendarScreenProps } from './calendar';
