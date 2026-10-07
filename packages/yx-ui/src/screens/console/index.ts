// The YukthiX platform console (P14 §7; YukthiX staff only) and support sessions (P02 Q8).
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { ConsoleShell, CONSOLE_LINKS, type ConsoleShellProps, type ConsolePageId } from './console-shell';
export { CompaniesScreen, companyInput, slugFrom, type CompaniesScreenProps } from './companies';
export { CompanyScreen, supportInput, type CompanyScreenProps } from './company';
export { PlansScreen, priceInput, type PlansScreenProps } from './plans';
export { SupportSessionsScreen, type SupportSessionsScreenProps } from './support';
export { PlatformAuditScreen, type PlatformAuditScreenProps } from './audit';
export { LIFECYCLE_LABEL, SUPPORT_LABEL, actionWords } from './console-kit';
