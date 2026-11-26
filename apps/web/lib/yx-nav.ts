import type { AreaId } from '@yukthix/ui/frame';

// The YukthiX menu by product area (design audit step 1, founder decisions 15 Oct 2026): the designed rail areas,
// each with the designed panel's sections and names where the live page is the same page. Areas with no built page are
// hidden; a link shows only to someone who may open it (the API still checks every call). Pure, so it is unit-tested.

/** Side-menu counts from GET /workspace/counts. */
export type CountKey = 'approvals' | 'notifications' | 'documentsToVerify' | 'exitCases' | 'payslipQueries' | 'myTickets' | 'scorecardsToDo' | 'readyToOnboard' | 'probationsDue' | 'clearanceToDo' | 'possibleSamePerson' | 'declarationsDue' | 'casesOpen' | 'ethicsReports' | 'icComplaints' | 'changesAsked';

export interface NavLink {
  id: string;
  label: string;
  href: string;
  count?: CountKey;
}
export interface NavSection {
  label?: string;
  items: NavLink[];
}
export interface NavArea {
  id: AreaId;
  /** Panel title (the designed one, e.g. "Hiring" for the Hire area). */
  title: string;
  sections: NavSection[];
}

export interface NavInput {
  has: (key: string) => boolean;
  role: string | null;
  /** A YukthiX support session (P02 Q8): read-only, no pay, hiring, desk or self-service. */
  support: boolean;
  /** Has an employee record (a manager on the team endpoint). */
  employee: boolean;
  /** Has reports. */
  manager: boolean;
  /** Can read some job history (own or team). */
  history: boolean;
  /** Owns clearance rows / checklist tasks; a new hire's first 30 days. */
  clearance: boolean;
  tasks: boolean;
  firstDays: boolean;
  /** The side-menu counts include Possible same person: company-wide HR (the server decides). */
  samePerson?: boolean;
  /** A designated person (BFSI): their annual declarations (the server decides). */
  designated?: boolean;
  /** HLP-08 (founder answer 36): on a speak-up list or a member of any case (the server decides, via the counts). */
  caseTeam?: boolean;
  /** ITSM answer 1953: on a change board, owns an application or approves a change (the server decides, via the counts). */
  changesAsked?: boolean;
  /** HLP-09: on the ethics or escalation list. */
  ethicsDesk?: boolean;
  /** CMP-11 (batch F item 13): a member of the Internal Committee (the server decides, via the counts). */
  icMember?: boolean;
  /** Founder answer 511: on an interview panel (the server decides): Interviews shows without any hiring key. */
  panellist?: boolean;
  /** The company turned the staffing desk on (Settings › Staffing desk; the server decides). */
  staffing?: boolean;
  /** Answer 2001: the company has assessments on (assessments.enabled, on by default; the server decides). */
  assessments?: boolean;
  /** Projects P-1: Projects is on and this person holds a Projects key or manages a project (the server decides). */
  projects?: boolean;
  /** P-2 (1406): timesheet lines waiting for this person's decision (the server decides). */
  lineApprovals?: number;
  /** Runs learning sessions as an internal trainer. */
  trainer?: boolean;
}

/** Possible same person is in the menu when the server sends its count: company-wide HR while a pair waits or for 90 days after any merge, even at 0. */
export const samePersonInMenu = (counts: Partial<Record<CountKey, number>> | undefined) => counts?.possibleSamePerson !== undefined;

const L = (id: string, label: string, href: string, count?: CountKey): NavLink => ({ id, label, href, ...(count ? { count } : {}) });
const when = <T,>(ok: boolean, ...items: T[]): T[] => (ok ? items : []);
const sec = (label: string | undefined, items: NavLink[]): NavSection[] => (items.length ? [{ ...(label ? { label } : {}), items }] : []);

export const ME_SECURITY = '/yx/me/security';
export const SETTINGS_HOME = '/yx/settings';

/**
 * Settings S-1 (answers 1321, 1322): each drawn settings page (by its number) is the front door to the live editors that
 * do its job today, in order; the first one the viewer may open is where it leads. A page with no live editor yet is
 * not listed (its own slice builds it). Never a second copy of a live page.
 */
/** S-2: the drawn Time & Leave pages that show the company's settings (id, title, address under /yx/settings/time). */
export const TIME_SETTINGS_PAGES: [string, string, string][] = [
  // S-7 (answer 1321): from Company rules.
  ['3.1', 'Attendance modes', 'attendance-modes'],
  ['3.2', 'Check-in & devices', 'check-in-and-devices'],
  ['3.3', 'Shifts & patterns', 'shifts-and-patterns'],
  ['3.4', 'Weekly offs', 'weekly-offs'],
  ['3.5', 'Late & regularisation', 'late-and-regularisation'],
  ['3.6', 'Leave types', 'leave-types'],
  ['3.8', 'Holiday calendars', 'holiday-calendars'],
  ['3.9', 'Leave year', 'leave-year'],
];
/** Answer 1485: HR's leave admins (leave.settings.manage) also open and change the leave pages; the rest stay with HR's settings key. */
export const LEAVE_SETTINGS_PAGES: readonly string[] = ['3.6', '3.8', '3.9'];
/** S-3: the drawn Payroll & Statutory pages that show the company's settings (address under /yx/settings/payroll). */
export const PAY_SETTINGS_PAGES: [string, string, string][] = [
  ['4.3', 'Payroll policies', 'payroll-policies'],
  // Menu name differs from the drawn title so it is not mistaken for the layout editor (Payroll › Payslip layout).
  ['4.4', 'Payslip settings', 'payslip-layout'],
  ['4.5', 'Tax', 'tax'],
  // S-7 (answers 1321, 1521): Payroll rules' settings, under the second person.
  ['4.6', 'Bonus & loan rules', 'loans-and-advances'],
  // Enterprise E4 (O19-O22): suspense, costing split and the journal format; the ledger mapping is its own page.
  ['4.12', 'Accounting & costing', 'accounting-and-costing'],
];
const payPage = (id: string) => PAY_SETTINGS_PAGES.filter((p) => p[0] === id).map((p) => `${SETTINGS_HOME}/payroll/${p[2]}`);
/** S-4: the drawn People & Access pages that show the company's settings (address under /yx/settings/people). */
export const PEOPLE_SETTINGS_PAGES: [string, string, string][] = [
  // S-6 (answer 1330): approval steps per request type, reminders and escalation.
  ['2.4', 'Approvals', 'approvals'],
  // S-7 (answers 1321, 1561): from Company rules and Access and privacy.
  ['2.1', 'Access requests', 'roles-and-access'],
  ['2.2', 'Directory & privacy', 'directory-and-privacy'],
  ['2.3', 'Security rules', 'security'],
  ['2.5', 'Onboarding & probation', 'onboarding-and-probation'],
  ['2.6', 'Job changes & transfers', 'job-changes-and-transfers'],
  ['2.7', 'Exit & lifecycle policies', 'exit-and-lifecycle-policies'],
  // IT assets part 1 (answer 2712): asset categories, acknowledgement and recovery.
  ['2.8', 'Assets', 'assets'],
  ['2.9', 'Employee relations & cases', 'employee-relations-and-cases'],
  ['2.10', 'Audit & data retention', 'audit-and-data-retention'],
];
const peoplePage = (id: string) => PEOPLE_SETTINGS_PAGES.filter((p) => p[0] === id).map((p) => `${SETTINGS_HOME}/people/${p[2]}`);
/** S-7 (answer 1321): the Organisation, Documents and Account pages that hold settings (address per group). */
export const MORE_SETTINGS_PAGES: [string, string, string, string][] = [
  ['1.1', 'Company & branding', 'org', 'company-and-branding'],
  ['1.5', 'Employee records', 'org', 'employee-records'],
  ['1.6', 'Set-up hub settings', 'org', 'set-up-hub'],
  // S-8 (answer 1331): 5.1 has its own route (the type list and drawer), under the same folder.
  ['5.1', 'Document types', 'documents', 'document-types'],
  ['5.4', 'Notifications', 'documents', 'notifications'],
  ['5.7', 'Policies', 'documents', 'policies'],
  ['8.6', 'Help and tips', 'account', 'analytics-status-and-tips'],
];
const morePage = (id: string) => MORE_SETTINGS_PAGES.filter((p) => p[0] === id).map((p) => `${SETTINGS_HOME}/${p[2]}/${p[3]}`);
const timePage = (id: string) => TIME_SETTINGS_PAGES.filter((p) => p[0] === id).map((p) => `${SETTINGS_HOME}/time/${p[2]}`);

/** Answer 1563: the company audit log. */
export const AUDIT_LOG = `${SETTINGS_HOME}/audit-log`;

export const SETTINGS_PAGE_EDITORS: Record<string, string[]> = {
  '1.1': [...morePage('1.1'), '/yx/settings/countries', '/yx/settings/translations', '/yx/settings/emails'],
  '1.2': ['/yx/settings/legal-entities'],
  '1.3': ['/yx/settings/locations', '/yx/time/setup/locations'],
  '1.4': ['/yx/settings/structure'],
  '1.5': [...morePage('1.5'), '/yx/settings/custom-fields'],
  '1.6': ['/yx/settings/setup-hub', ...morePage('1.6')],
  '2.1': ['/yx/settings/access', ...peoplePage('2.1')],
  '2.2': peoplePage('2.2'),
  '2.3': ['/yx/settings/security', ...peoplePage('2.3'), '/yx/settings/identity-providers', '/yx/settings/support-access'],
  '2.4': [...peoplePage('2.4'), '/yx/settings/approval-policies'],
  '2.5': [...peoplePage('2.5'), '/yx/settings/checklists'],
  '2.6': peoplePage('2.6'),
  '2.7': peoplePage('2.7'),
  '2.8': peoplePage('2.8'),
  '2.9': [...peoplePage('2.9'), '/yx/desk/speakup-setup'],
  '2.10': [...peoplePage('2.10'), AUDIT_LOG],
  '3.1': timePage('3.1'),
  '3.2': [...timePage('3.2'), '/yx/time/setup/devices', '/yx/time/setup/locations'],
  '3.3': [...timePage('3.3'), '/yx/time/shifts-setup'],
  '3.4': [...timePage('3.4'), '/yx/time/setup/locations', '/yx/time/shifts-setup'],
  '3.5': timePage('3.5'),
  '3.6': [...timePage('3.6'), '/yx/time/setup'],
  '3.7': ['/yx/time/setup'],
  '3.8': [...timePage('3.8'), '/yx/time/setup/holidays', '/yx/time/setup/holiday-feeds'],
  '3.9': [...timePage('3.9'), '/yx/time/setup/year-end'],
  '3.10': ['/yx/time/periods'],
  '3.11': ['/yx/settings/projects'],
  '3.12': ['/yx/settings/visitors'],
  '4.1': ['/yx/payroll/pay-groups', '/yx/payroll/periods'],
  '4.2': ['/yx/payroll/components', '/yx/payroll/templates'],
  '4.3': payPage('4.3'),
  '4.4': [...payPage('4.4'), '/yx/payroll/payslip-layout'],
  '4.5': payPage('4.5'),
  '4.6': [...payPage('4.6'), '/yx/payroll/loans'],
  '4.7': ['/yx/payroll/statutory', '/yx/payroll/statutory-rules'],
  '4.8': ['/yx/settings/finance/expenses-and-travel', '/yx/settings/expenses'],
  '4.9': ['/yx/settings/contract-labour'],
  '4.10': ['/yx/payroll/ewa'],
  // B8/E5: Benefits & FBP, the flexible benefit plan (answer 2411).
  '4.11': ['/yx/settings/benefits'],
  // Enterprise E4: Accounting & costing, with the ledger mapping page.
  '4.12': [...payPage('4.12'), '/yx/payroll/accounting'],
  '5.1': morePage('5.1'),
  '5.2': ['/yx/settings/letters'],
  '5.3': ['/yx/settings/letters'],
  '5.4': [...morePage('5.4'), '/yx/settings/emails'],
  '5.5': ['/yx/settings/sms'],
  '5.7': [...morePage('5.7'), '/yx/desk/policy-admin'],
  '5.8': ['/yx/desk/setup'],
  '6.1': ['/yx/settings/hiring'],
  '6.2': ['/yx/settings/staffing'],
  '6.3': ['/yx/settings/talent/performance', '/yx/settings/performance'],
  // AS-2: the company's assessment defaults (Settings 6.5).
  '6.5': ['/yx/settings/talent/assessments'],
  // S-10 (answer 1327): group 7 on the checked older routes (System Admins; 7.5 is each person's own calendar).
  '7.1': [`${SETTINGS_HOME}/integrations/integrations`],
  '7.2': ['/yx/time/setup/devices'],
  '7.3': ['/yx/payroll/payment-modes'],
  '7.5': [`${SETTINGS_HOME}/integrations/calendar-and-chat`],
  '7.6': [`${SETTINGS_HOME}/integrations/ai`],
  '7.7': [`${SETTINGS_HOME}/integrations/developers`],
  // S-9 (answers 1328, 1332): group 8 live; billing read-only for the billing key, 8.5 for System Admins.
  '8.1': [`${SETTINGS_HOME}/account/plan-and-add-ons`],
  '8.2': [`${SETTINGS_HOME}/account/usage-and-caps`],
  '8.3': [`${SETTINGS_HOME}/account/invoices-and-payment`],
  '8.5': [`${SETTINGS_HOME}/account/data-export-and-closure`],
  '8.6': morePage('8.6'),
};
const ME = 'Me';

/**
 * The side panel for the page (design: PeopleFrame and MeFrame): on a Me page the People rail shows the panel "Me"
 * with the Me links alone; elsewhere the area's panel without them.
 */
export function panelOf(area: NavArea, linkId: string | undefined): { title: string; sections: NavSection[] } {
  const me = area.sections.find((s) => s.label === ME);
  if (me && me.items.some((l) => l.id === linkId)) return { title: ME, sections: [{ items: me.items }] };
  return { title: area.title, sections: area.sections.filter((s) => s !== me) };
}

/** Keys that open at least one report in the library (apps/api/src/library/report-catalogue.ts). */
const REPORT_KEYS = ['payroll.reports.view', 'statutory.filing.view', 'expense.report.view', 'attendance.view', 'perf.report.view', 'learning.report.view', 'desk.report.view', 'visitors.log.view', 'visitors.desk.manage', 'ats.costs.manage'];

export function buildNav(n: NavInput): NavArea[] {
  const { has, support, employee, manager } = n;
  const any = (...keys: string[]) => keys.some(has);
  const self = employee && !support;
  const settingsAdmin = has('org.settings.manage');
  const hr = support || any('employee.profile.view', 'employee.change.manage', 'employee.change.approve');
  // Answer 1333: HR who read the structure open the People settings pages read-only (only the change key edits); the
  // structure key alone (managers' pickers) opens no settings page (founder review, 8 Oct 2026).
  const settingsView = settingsAdmin || (hr && has('org.structure.view'));
  const orgPages = settingsAdmin || has('pay.range.view') || support || (hr && has('org.structure.view'));
  const exitView = any('lifecycle.exit.view', 'lifecycle.exit.manage');
  const onboardView = any('lifecycle.onboarding.view', 'lifecycle.onboarding.manage');
  const adminRole = n.support || n.role === 'org_admin';

  const home: NavArea = {
    id: 'home',
    title: 'Home',
    sections: [
      // The designed Home panel (PLT-01): Home · Approvals · Notifications · Search · My requests.
      ...sec(undefined, [
        L('home', 'Home', '/yx/home'),
        ...when(!support, L('approvals', 'Approvals', '/yx/approvals', 'approvals')),
        ...when(!support, L('notifications', 'Notifications', '/yx/notifications', 'notifications')),
        L('search', 'Search', '/yx/search'),
        ...when(!support, L('my-requests', 'My requests', '/yx/me/requests')),
        // A new hire's own steps: not in the designed six-item Me menu, so on Home (founder 28 Oct 2026).
        ...when(self && n.firstDays, L('first-30', 'My first 30 days', '/yx/me/first-30-days')),
      ]),
    ],
  };
  // The designed Me menu (PPL-30 MeFrame, founder 28 Oct 2026): under People, exactly these six. A designated person's
  // annual declarations and trading pre-clearance are pages of Declarations. Personal settings are in the avatar menu.
  const me = sec(ME, [
    ...when(hr || employee, L('profile', 'Profile', '/yx/people/profile')),
    ...when(employee, L('my-documents', 'Documents & letters', '/yx/me/documents'), L('my-changes', 'Change requests', '/yx/me/change-requests'), L('my-declarations-self', 'Declarations', '/yx/me/declarations', n.designated ? 'declarationsDue' : undefined), L('my-data', 'Privacy', '/yx/me/privacy'), L('resign', 'My exit', '/yx/me/resignation')),
  ]);

  // Managers without HR keys get the designed "For my team" group instead of Onboarding / Changes / Exits.
  const team = !hr;
  const peopleWork: NavSection[] = [
    ...sec(undefined, [...when(hr || employee, L('directory', 'Directory', '/yx/people/directory'), L('org-chart', 'Org chart', '/yx/people/org-chart')), ...when(has('org.position.manage'), L('positions', 'Positions', '/yx/people/positions')), ...when(manager, L('team', 'My team', '/yx/people/team')), ...when(!support && (employee || has('company.documents.manage')), L('company-docs', 'Company documents', '/yx/people/company-documents'))]),
    ...sec(team ? 'For my team' : 'Onboarding', [
      ...when(onboardView, L('onboarding', 'Onboarding board', '/yx/people/onboarding')),
      ...when(has('lifecycle.onboarding.manage'), L('ready-to-onboard', 'Ready to onboard', '/yx/people/ready-to-onboard', 'readyToOnboard'), L('batches', 'Batches', '/yx/people/batches')),
      // Probation decisions are HR's (employee.change.manage) or the manager's; payroll does no HR work (founder 21 Oct 2026).
      ...when(manager || has('employee.change.manage'), L('probation', 'Probation', '/yx/people/probation', 'probationsDue')),
      ...when(onboardView, L('buddies', 'Buddies', '/yx/people/buddies')),
      ...when(onboardView, L('life-events', 'Life events', '/yx/people/life-events')),
      ...when(n.tasks || has('lifecycle.onboarding.manage'), L('my-tasks', 'My checklist tasks', '/yx/people/my-tasks')),
      ...when(team && (any('employee.change.manage', 'request.raise_on_behalf')), L('job-changes', 'Change action', '/yx/people/changes')),
      ...when(team && (exitView || manager), L('exits', 'Exit cases', '/yx/people/exits', 'exitCases')),
      ...when(team && (n.clearance || has('lifecycle.exit.manage')), L('clearance', 'Clearance', '/yx/people/clearance', 'clearanceToDo')),
    ]),
    ...sec('Changes', [
      ...when(!team && (any('employee.change.manage', 'request.raise_on_behalf')), L('job-changes', 'Change action', '/yx/people/changes')),
      ...when(any('employee.change.manage', 'employee.change.approve'), L('scheduled-changes', 'Scheduled', '/yx/people/scheduled')),
      ...when(has('employee.change.manage'), L('bulk-changes', 'Bulk changes', '/yx/people/bulk-changes')),
      // Founder decision 21 Oct 2026: HR plans and approves restructures; payroll does no HR work, yet opens the done ones
      // to keep its continuity checklist (28 Oct 2026).
      ...when(any('employee.change.manage', 'payroll.run.prepare'), L('restructure', 'Restructure', '/yx/people/restructure')),
      ...when(has('employee.change.manage'), L('import', 'Import', '/yx/people/import')),
      ...when(hr || n.history, L('job-history', 'Job history', '/yx/people/history')),
      ...when(any('employee.identity.approve', 'employee.identity.manage'), L('profile-requests', 'Identity and bank changes', '/yx/people/profile-requests')),
      // PPL-50: HR decides managers' requests to see their team's pay (two HR people each).
      ...when(has('employee.pay_access.approve'), L('pay-access', 'Team pay access', '/yx/people/pay-access')),
    ]),
    ...sec('Exits', [
      ...when(!team && (exitView || manager), L('exits', 'Exit cases', '/yx/people/exits', 'exitCases')),
      // Same F&F page as Pay's, at a People address so HR stays in the People menu (founder decision 26 Oct 2026).
      ...when(!team && any('payroll.fnf.manage', 'payroll.notice.waive'), L('people-fnf', 'F&F', '/yx/people/fnf')),
      ...when(!team && (n.clearance || has('lifecycle.exit.manage')), L('clearance', 'Clearance', '/yx/people/clearance', 'clearanceToDo')),
      ...when(exitView, L('upcoming-exits', 'Retirements and contracts', '/yx/people/upcoming-exits')),
      ...when(has('lifecycle.exit.manage'), L('absconding', 'Absconding', '/yx/people/absconding')),
    ]),
    ...sec(undefined, [
      ...when(has('document.manage'), L('documents-verify', 'Documents & letters', '/yx/people/documents', 'documentsToVerify')),
      ...when(has('letter.issue'), L('letters', 'Letters', '/yx/people/letters')),
      ...when(has('asset.view'), L('assets', 'Assets', '/yx/people/assets')),
      // IT assets part 3 (answer 2716): the IT and Admin supplier list next to the register.
      ...when(has('asset.view'), L('asset-suppliers', 'Asset suppliers', '/yx/people/assets/suppliers')),
      // Answer 2717: asset contracts.
      ...when(has('asset.view'), L('asset-contracts', 'Asset contracts', '/yx/people/assets/contracts')),
      // Answer 2718: software licences.
      ...when(has('asset.view'), L('asset-licences', 'Software licences', '/yx/people/assets/licences')),
      // Answer 2715: asset bookings (IT's list and loan report).
      ...when(has('asset.view'), L('asset-bookings', 'Asset bookings', '/yx/people/assets/bookings')),
      ...when(has('succession.manage'), L('succession', 'Succession', '/yx/people/succession')),
    ]),
    // Founder decision 8 Oct 2026: HR checks people the Service Desk made for logins with no person.
    ...sec('More', [
      ...when(!support && Boolean(n.samePerson), L('same-person', 'Possible same person', '/yx/people/same-person', 'possibleSamePerson')),
      ...when(has('lifecycle.exit.manage'), L('unions', 'Union register', '/yx/people/unions'), L('retrenchment', 'VRS schemes', '/yx/people/retrenchment')),
      ...when(has('document.manage'), L('reverification', 'Re-verification', '/yx/people/reverification')),
      ...when(has('employee.disability.view'), L('declarations', 'Declarations', '/yx/people/declarations')),
      ...when(has('compliance.declaration.manage'), L('regulated-declarations', 'Regulated declarations', '/yx/people/regulated-declarations'), L('pre-clearance', 'Pre-clearance requests', '/yx/people/pre-clearance')),
    ]),
  ];
  // Someone with no People work beyond the directory opens People on their own pages (Me).
  const peopleAdmin = hr || manager || peopleWork.length > 1;
  const people: NavArea = { id: 'people', title: 'People', sections: peopleAdmin ? [...peopleWork, ...me] : [...me, ...peopleWork] };

  const time: NavArea = {
    id: 'time',
    title: 'Time',
    sections: [
      ...sec(undefined, [
        ...when(manager || has('attendance.view'), L('today', 'Today', '/yx/time/today'), L('muster', 'Muster', '/yx/time/muster'), L('exceptions', 'Exceptions', '/yx/time/exceptions')),
        ...when(manager || has('roster.manage'), L('roster', 'Roster', '/yx/time/roster'), L('open-shifts', 'Open shifts', '/yx/time/open-shifts')),
        ...when(manager || has('roster.manage'), L('auto-roster', 'Auto-roster', '/yx/time/auto-roster'), L('standby', 'Standby & call-outs', '/yx/time/standby')),
        ...when(manager || has('attendance.view'), L('field-force', 'Field force', '/yx/time/field-force')),
        ...when(has('leave.view'), L('hr-leave', 'Leave', '/yx/time/leave-home')),
        // TIM-17 Manager: a manager's own team's leave waiting for them (HR has its own Leave page above).
        ...when(manager, L('team-leave-home', 'Team leave', '/yx/time/team-leave')),
        ...when(manager || has('leave.view'), L('team-leave', 'Leave calendar', '/yx/time/team')),
        ...when(manager || has('attendance.view'), L('overtime-review', 'Overtime', '/yx/time/overtime-review')),
        ...when(manager || has('leave.view'), L('block-leave', 'Block leave', '/yx/time/block-leave')),
        ...when(has('leave.view'), L('leave-balances', 'Leave balances', '/yx/time/balances')),
        // Founder answer A: Payroll (leave.liability.view without leave.view) opens the same page on the liability report only.
        ...when(!has('leave.view') && has('leave.liability.view'), L('leave-liability', 'Leave liability', '/yx/time/balances')),
        ...when(has('attendance.lock') || has('attendance.lock.approve'), L('periods', 'Periods', '/yx/time/periods')),
        ...when(has('attendance.lock'), L('device-punches', 'Device punches', '/yx/time/device-punches'), L('industrial-action', 'Industrial action', '/yx/time/industrial-action')),
        ...when(manager || has('attendance.view'), L('attendance-reports', 'Attendance reports', '/yx/time/reports'), L('presence', 'Presence days', '/yx/time/presence')),
        ...when(has('attendance.view'), L('registers', 'Registers', '/yx/time/registers'), L('payroll-feed', 'Payroll feed', '/yx/time/payroll-feed')),
      ]),
      ...sec('My time', when(self, L('my-attendance', 'My attendance', '/yx/time/attendance'), L('my-leave', 'My leave', '/yx/time/leave'), L('my-shifts', 'My shifts', '/yx/time/shifts'), ...when(!manager && !has('roster.manage'), L('team-roster', 'Team roster', '/yx/time/roster')), L('office-days', 'Office days', '/yx/time/hybrid'), L('my-timesheet', 'My timesheet', '/yx/time/timesheet'), L('my-overtime', 'My overtime', '/yx/time/overtime'), L('my-presence', 'My work-from-home days', '/yx/time/presence?view=me'))),
      ...sec('Time settings', when(has('leave.settings.manage'), L('shifts-setup', 'Shifts & patterns', '/yx/time/shifts-setup'), L('time-setup', 'Leave types & policies', '/yx/time/setup'), L('time-holidays', 'Holiday calendars', '/yx/time/setup/holidays'), L('holiday-feeds', 'Holiday feeds', '/yx/time/setup/holiday-feeds'), L('time-locations', 'Locations & geofences', '/yx/time/setup/locations'), L('time-licences', 'Licences', '/yx/time/setup/licences'), L('time-devices', 'Devices & kiosks', '/yx/time/setup/devices'), L('year-end', 'Year-end', '/yx/time/setup/year-end'))),
    ],
  };

  // No payroll for YukthiX staff in a support session (P02 Q8): the API and the database refuse it too.
  const pay = !support;
  const pays: NavArea = {
    id: 'pay',
    title: 'Pay',
    sections: !pay
      ? []
      : [
          ...sec('Payroll', [
            ...when(any('payroll.run.view', 'payroll.run.prepare', 'payroll.run.approve', 'payroll.offcycle.prepare'), L('pay-runs', 'Payroll home', '/yx/payroll/runs')),
            ...when(has('payroll.input.manage'), L('pay-inputs', 'Inputs', '/yx/payroll/inputs'), L('pay-fbp', 'Flexible benefits', '/yx/payroll/flexible-benefits')),
            ...when(has('payroll.query.handle'), L('pay-queries', 'Queries', '/yx/payroll/payslip-queries', 'payslipQueries')),
            ...when(any('payroll.fnf.manage', 'payroll.notice.waive'), L('pay-fnf', 'Full and final', '/yx/payroll/fnf')),
            ...when(any('payroll.period.view', 'payroll.period.reopen', 'payroll.period.reopen.approve'), L('pay-periods', 'Pay periods', '/yx/payroll/periods'), L('reopen-requests', 'Reopen requests', '/yx/payroll/reopen-requests')),
            ...when(any('payroll.run.prepare', 'payroll.setup.manage'), L('pay-go-live', 'Go-live readiness', '/yx/payroll/go-live')),
          ]),
          ...sec(undefined, [
            ...when(has('employee.salary.manage'), L('pay-compensation', 'Compensation', '/yx/payroll/compensation')),
            ...when(has('payroll.special.manage'), L('pay-special', 'Special pay', '/yx/payroll/special-pay')),
            ...when(any('payroll.bonus.manage', 'payroll.bonus.approve'), L('pay-bonus', 'Statutory bonus', '/yx/payroll/bonus')),
            ...when(has('payroll.equity.manage'), L('pay-equity', 'Equity', '/yx/payroll/equity')),
            ...when(any('consultant.manage', 'consultant.invoice.approve'), L('pay-consultants', 'Consultants', '/yx/payroll/consultants')),
            ...when(has('tax.proof.verify'), L('pay-proofs', 'Tax centre', '/yx/payroll/proofs')),
            // Batch H part 2 E2: HR declares for an employee without a login.
            ...when(has('tax.regime.override'), L('pay-tax-declare', 'Declare for an employee', '/yx/payroll/tax-declare')),
          ]),
          ...sec('Loans, recoveries & EWA', [
            ...when(has('payroll.loan.manage'), L('pay-loans', 'Loans and advances', '/yx/payroll/loans')),
            ...when(any('payroll.arrears.approve', 'payroll.writeoff.approve'), L('pay-arrears', 'Arrears and recoveries', '/yx/payroll/arrears')),
            ...when(has('payroll.ewa.manage'), L('pay-ewa', 'Earned wage access', '/yx/payroll/ewa')),
          ]),
          // Founder decision 15 Oct 2026: Expenses sit under Pay.
          ...sec('Expenses & advances', [
            // Each page's link names the page, so the breadcrumb reads Pay › Expenses, Pay › Trips … (walk-through 3 Nov 2026);
            // a claim, trip or advance names its parent list.
            ...when(employee || has('expense.finance.review'), L('expenses', 'Expenses', '/yx/expenses')),
            ...when(manager, L('expense-team', 'Team claims', '/yx/expenses/team')),
            ...when(employee || has('travel.booking.manage'), L('expense-trips', 'Trips', '/yx/expenses/trips')),
            ...when(employee || has('expense.payout.manage'), L('expense-advances', 'Advances', '/yx/expenses/advances')),
            ...when(has('expense.payout.manage'), L('expense-to-pay', 'To pay', '/yx/expenses/to-pay')),
            ...when(has('expense.payout.manage'), L('expense-cards', 'Card statements', '/yx/expenses/cards')),
            ...when(has('expense.report.view'), L('expense-reports', 'Expense reports', '/yx/expenses/reports')),
            ...when(has('expense.policy.manage') || has('expense.policy.view'), L('expense-setup', 'Expense policy', '/yx/settings/expenses')),
          ]),
          ...sec('Payments & files', [
            ...when(has('payroll.payment.record'), L('pay-modes', 'Payment modes', '/yx/payroll/payment-modes')),
            ...when(has('payroll.file.view'), L('pay-files', 'Payroll files', '/yx/payroll/files')),
            ...when(has('payroll.document.view'), L('pay-documents', 'Pay documents', '/yx/payroll/documents')),
          ]),
          ...sec('Reports', [
            ...when(has('payroll.reports.view'), L('pay-reports', 'Payroll reports', '/yx/payroll/reports')),
            ...when(any('payroll.special.manage', 'payroll.journal.export'), L('pay-actuarial', 'Actuarial valuation', '/yx/payroll/actuarial')),
            ...when(has('audit.view'), L('pay-audit', 'Audit log', '/yx/payroll/audit')),
          ]),
          ...sec('My pay', when(employee, L('my-payslips', 'Payslips', '/yx/me/payslips'), L('my-tax', 'Tax workspace', '/yx/me/tax'), L('my-declarations', 'Tax declarations', '/yx/me/tax-declarations'), L('my-loans', 'Loans & advances', '/yx/me/loans'), L('my-ewa', 'Get paid early', '/yx/me/earned-pay'), L('my-incentives', 'My incentives', '/yx/me/incentives'), L('pay-band', 'My pay band', '/yx/performance/pay-band'), L('my-equity', 'My equity', '/yx/me/equity'), L('my-fbp', 'Flexible benefits', '/yx/me/flexible-benefits'), L('my-pay-documents', 'My pay documents', '/yx/me/pay-documents'))),
        ],
  };

  const compliance: NavArea = {
    id: 'compliance',
    title: 'Compliance',
    sections: !pay
      ? []
      : sec(undefined, [
          ...when(has('statutory.filing.view'), L('pay-statutory', 'Statutory hub', '/yx/payroll/statutory')),
          ...when(has('payroll.setup.manage'), L('pay-rules', 'Statutory rules', '/yx/payroll/statutory-rules'), L('pay-coverage', 'Statutory coverage', '/yx/payroll/coverage')),
          ...when(has('statutory.filing.view'), L('pay-registers', 'Registers', '/yx/payroll/registers')),
          // CMP-07 (founder answer 22): people missing a PAN, UAN, ESI IP number or a usable salary account.
          ...when(has('statutory.filing.view'), L('pay-missing-ids', 'Missing IDs', '/yx/payroll/missing-ids')),
          ...when(has('payroll.document.issue'), L('pay-certificates', 'TDS & Form 16', '/yx/payroll/certificates')),
          ...when(any('statutory.filing.view', 'consultant.manage'), L('pay-consultant-tds', 'Consultant TDS returns', '/yx/payroll/consultant-tds')),
          ...when(has('statutory.advisory.review'), L('pay-advisories', 'Rules & updates', '/yx/payroll/advisories')),
        ]),
  };

  // M10 AT1: hiring, for holders of the hiring keys (founder D2); never in a support session (D14). YukthiX Hiring is
  // the only hiring app (founder decision 15 Oct 2026). Decision 2398 (step 5): no link to the older /v2 screens; test
  // results are each test's Results tab, or Test results for readers.
  const hire: NavArea = {
    id: 'hire',
    title: 'Hiring',
    sections: support
      ? []
      : [
          ...sec(undefined, [
          // HIR-01 (founder decision 11): a hiring manager reads their own department's plan.
          // Answer 2432: the ANL-02 Recruiter dashboard (the API checks results:view).
          ...when(has('results:view'), L('hiring-dashboard', 'Dashboard', '/yx/hiring/dashboard')),
          // Answer 2428: ANL-08 report schedules (the weekly hiring digest), for company admins.
          ...when(has('org:manage_settings'), L('hiring-schedules', 'Report schedules', '/yx/hiring/schedules')),
          ...when(any('ats.headcount.manage', 'ats.requisition.raise'), L('hiring-plans', 'Headcount plan', '/yx/hiring/plans')),
          // AS-0: candidate view is enough (the Interview coordinator reads jobs and candidates, without test results).
          ...when(any('pipeline:manage', 'results:view', 'candidate:view'), L('hiring-jobs', 'Jobs & requisitions', '/yx/hiring/jobs')),
          // HIR-02: recruiting and HR see every requisition; a hiring manager their own, read-only (decision 11).
          ...when(any('pipeline:manage', 'ats.headcount.manage', 'ats.requisition.raise'), L('hiring-requisitions', 'Requisitions', '/yx/hiring/requisitions')),
          // Founder answer 511: interviews are for people on a panel (or with the keys), never every employee.
          ...when(Boolean(n.panellist) || any('interview:view_assigned', 'pipeline:manage'), L('hiring-interviews', 'Interviews', '/yx/hiring/interviews', 'scorecardsToDo')),
          ...when(any('candidate:manage', 'candidate:view'), L('hiring-candidates', 'Candidates & talent CRM', '/yx/hiring/candidates'), L('hiring-pools', 'Talent CRM', '/yx/hiring/pools')),
          // HIR-12 (design: under Hiring): an employee, or anyone already in Hiring, refers a friend to an open job and
          // follows the bonus (the API lets anyone signed in refer; someone with no record and no keys keeps a bare menu).
          ...when(employee || any('ats.headcount.manage', 'pipeline:manage', 'results:view', 'interview:view_assigned', 'candidate:manage', 'candidate:view'), L('hiring-referrals', 'Referrals', '/yx/hiring/referrals')),
          // HIR-13: internal jobs are for people with an employee record (the API checks the company rules).
          ...when(employee, L('hiring-internal-jobs', 'Internal jobs', '/yx/hiring/internal-jobs')),
          ...when(has('org:manage_settings'), L('hiring-careers', 'Careers site', '/yx/hiring/careers'), L('hiring-boards', 'Job boards', '/yx/hiring/job-boards')),
          // HIR-21: recruitment agencies and staffing vendors (one model); recruiters review their submissions here.
          ...when(any('ats.agency.manage', 'ats.staffing.manage', 'org:manage_settings', 'pipeline:manage', 'ats.staffing.billing'), L('hiring-vendors', 'Vendors', '/yx/hiring/vendors')),
          ...when(has('approvals:configure'), L('hiring-approvals', 'Hiring approvals', '/yx/hiring/approval-routes')),
          ...when(has('candidate:data_rights'), L('hiring-retention', 'Candidate data retention', '/yx/hiring/retention')),
          // HIR-10: HR with the background-check key (Special data; the API checks the joiner's scope).
          ...when(has('lifecycle.bgv.manage'), L('hiring-bgv', 'Background checks', '/yx/hiring/bgv')),
          // Answer 2437: results readers (interviewers, hiring managers) see test results here; test writers on each test's Results tab.
          ...when(any('results:view', 'asmt.results.view') && !any('exam:manage', 'question_bank:manage'), L('hiring-results', 'Test results', '/yx/hiring/assessments/results')),
          ]),
          // Answer 2001 (AS-1 follow-ups): Hire › Assessments, for bank writers (the YukthiX key or its older alias), only when
          // the company has assessments on. Tests, delivery and results join as their designed screens go live.
          ...sec('Assessments', [
            ...when(Boolean(n.assessments) && any('asmt.bank.manage', 'question_bank:manage'), L('asmt-bank', 'Question bank', '/yx/hiring/assessments/questions')),
            // Answer 2159 (AS-3): Tests next to the Question bank, for test writers (the YukthiX key or its older alias).
            ...when(Boolean(n.assessments) && any('asmt.test.manage', 'exam:manage'), L('asmt-tests', 'Tests', '/yx/hiring/assessments/tests')),
            ...when(Boolean(n.assessments) && any('asmt.bank.manage', 'question_bank:manage'), L('asmt-reviews', 'Question review', '/yx/hiring/assessments/reviews'), L('asmt-items', 'Item analysis', '/yx/hiring/assessments/item-analysis')),
            // AS-3 (PRC-07): invitations and drives for the people who invite candidates.
            ...when(Boolean(n.assessments) && any('ats.candidate.manage', 'candidate:manage'), L('asmt-invitations', 'Invitations & drives', '/yx/hiring/assessments/invitations')),
            // AS-5 (answers 2006, 2012): integrity review and appeals, for the people who proctor, evaluate or own tests.
            ...when(Boolean(n.assessments) && any('asmt.proctor', 'asmt.evaluate', 'exam:manage'), L('asmt-integrity', 'Integrity review', '/yx/hiring/assessments/integrity'), L('asmt-appeals', 'Appeals', '/yx/hiring/assessments/appeals'), L('asmt-integrity-reports', 'Integrity reports', '/yx/hiring/assessments/integrity-reports')),
            // AS-6 (PRC-19, answer 2019): marking for markers; fairness for test writers and results readers.
            ...when(Boolean(n.assessments) && any('asmt.evaluate', 'exam:manage'), L('asmt-marking', 'Marking', '/yx/hiring/assessments/marking')),
            ...when(Boolean(n.assessments) && any('asmt.test.manage', 'exam:manage', 'asmt.results.view'), L('asmt-fairness', 'Fairness', '/yx/hiring/assessments/fairness')),
          ]),
          // Staffing desk slice 1 (HIR-14, HIR-15): its own group, only for a company that turned the desk on.
          // Slice 2 (HIR-16, HIR-17): submissions, placements and the bench.
          ...sec('Staffing desk', [...when(Boolean(n.staffing) && any('ats.staffing.manage', 'ats.staffing.view'), L('staffing-clients', 'Clients', '/yx/staffing/clients'), L('staffing-rates', 'Rate cards', '/yx/staffing/rate-cards'), L('staffing-submissions', 'Submissions', '/yx/staffing/submissions'), L('staffing-placements', 'Placements & bench', '/yx/staffing/placements')), ...when(Boolean(n.staffing) && any('ats.staffing.manage', 'ats.staffing.billing'), L('staffing-invoices', 'Invoices', '/yx/staffing/invoices')), ...when(Boolean(n.staffing) && has('ats.staffing.billing'), L('staffing-collections', 'Collections', '/yx/staffing/collections'))]),
          // HIR-11: the design puts Recruiting costs under "Reports & compliance" (key ats.costs.manage, founder answer 202).
          // HIR-12 All referrals (answer 204): HR with ats.referral.manage, or recruiters who see candidates.
          ...sec('Reports & compliance', [
            ...when(has('ats.costs.manage'), L('hiring-costs', 'Recruiting costs', '/yx/hiring/costs')),
            ...when(any('ats.referral.manage', 'candidate:view'), L('hiring-all-referrals', 'All referrals', '/yx/hiring/referrals/all')),
            // HIR-23: the bias audit record (recruiting and the hiring settings holders).
            ...when(any('ats.settings.manage', 'org.settings.manage', 'pipeline:manage'), L('hiring-bias-audits', 'Bias audits', '/yx/hiring/bias-audits')),
          ]),
        ],
  };

  // Learning (the core): the designed panel's names (LRN): My learning and Catalogue for employees, My team for
  // managers, Compliance for training reports, Course builder for L&D. My tests, Sessions, Needs & budgets and Skills
  // have no live page yet (hidden).
  const learning: NavArea = {
    id: 'learning',
    title: 'Learning',
    sections: sec(undefined, [
      ...when(self, L('my-learning', 'My learning', '/yx/learning'), L('catalogue', 'Catalogue', '/yx/learning/catalogue'), L('my-skills', 'My skills', '/yx/learning/skills')),
      ...when(self && manager, L('team-learning', 'My team', '/yx/learning/team'), L('team-skills', 'Team skills', '/yx/learning/skills/team'), L('training-checks', 'Training checks', '/yx/learning/checks')),
      ...when(!support && (has('learning.manage') || Boolean(n.trainer)), L('learning-sessions', 'Sessions', '/yx/learning/sessions')),
      ...when(!support && has('learning.report.view'), L('learning-compliance', 'Compliance', '/yx/learning/compliance')),
      ...when(!support && has('learning.manage'), L('course-builder', 'Course builder', '/yx/learning/courses')),
      ...when(!support && has('learning.manage'), L('learning-needs', 'Needs & budgets', '/yx/learning/needs')),
    ]),
  };

  const performance: NavArea = {
    id: 'performance',
    title: 'Performance',
    sections: sec(undefined, [
      ...when(employee || has('perf.goal.manage') || has('perf.cycle.manage'), L('perf-home', 'Performance home', '/yx/performance')),
      ...when(employee, L('goals', 'Goals', '/yx/performance/goals')),
      ...when(has('perf.goal.view'), L('goal-map', 'Goal map', '/yx/performance/goal-map')),
      ...when(has('perf.cycle.manage'), L('review-cycles', 'Review cycles', '/yx/performance/cycles')),
      ...when(employee, L('feedback', 'Feedback', '/yx/performance/feedback'), L('feedback-tasks', 'Feedback I owe', '/yx/performance/feedback-tasks'), L('one-on-ones', '1:1s', '/yx/performance/one-on-ones')),
      ...when(has('perf.calibration.facilitate'), L('calibration', 'Calibration & comp review', '/yx/performance/calibrations')),
      ...when(any('perf.comp.manage', 'perf.comp.approve'), L('comp-review', 'Comp review', '/yx/performance/comp')),
      ...when(has('perf.comp.manage'), L('comp-market', 'Market data', '/yx/performance/comp/market')),
      ...when(manager || has('perf.pip.manage'), L('pips', 'PIPs', '/yx/performance/pips')),
      ...when(has('perf.concern.seal'), L('reviewer-blocks', 'Reviewer blocks', '/yx/performance/reviewer-blocks')),
      ...when(has('perf.report.view'), L('perf-reports', 'Reports', '/yx/performance/reports')),
      // Performance builder 3: PRF-16 coach, PRF-13 hand-overs, PRF-14 competencies, PRF-15 disputes.
      ...when(manager, L('coach', 'Manager coach', '/yx/performance/coach')),
      ...when(manager || has('perf.cycle.manage'), L('handovers', 'Hand-over list', '/yx/performance/handovers')),
      ...when(has('perf.setup.manage'), L('competencies', 'Skills & competencies', '/yx/performance/competencies')),
      ...when(has('perf.dispute.manage'), L('disputes', 'Rating disputes', '/yx/performance/disputes')),
    ]),
  };

  const deskSetup = any('desk.desk.create', 'desk.settings.manage', 'desk.member.manage', 'desk.mailbox.manage', 'desk.portal.manage', 'desk.catalog.manage', 'desk.rule.manage', 'desk.lifecycle.manage', 'desk.channel.manage');
  const helpdesk: NavArea = {
    id: 'helpdesk',
    title: 'Helpdesk',
    sections: support
      ? []
      : sec(undefined, [
          L('desk-help', 'Help centre', '/yx/desk/help'),
          ...when(has('desk.ticket.view'), L('desk-tickets', 'Tickets', '/yx/desk/tickets', 'myTickets')),
          ...when(any('desk.kb.view_internal', 'desk.kb.author', 'desk.kb.publish'), L('desk-knowledge', 'Knowledge base', '/yx/desk/knowledge')),
          L('desk-policies', 'Policies', '/yx/desk/policies'),
          L('desk-speakup', 'Speak up', '/yx/desk/speakup'),
          // HLP-12 (founder answer 47): anyone reports a workplace accident or injury, for themselves or someone else.
          L('desk-accident', 'Report an accident', '/yx/desk/accidents/report'),
          // HLP-07/08/09: one's own part of a case for everyone; Cases and the Ethics desk only for the people they concern
          // (founder answer 36). Hiding is not security: every case route checks membership again.
          L('desk-my-cases', 'My cases', '/yx/desk/my-cases'),
          // HLP-08 answer 55: a manager reports misconduct by one of their own reports to HR.
          ...when(!support && manager, L('desk-report-misconduct', 'Report misconduct', '/yx/desk/report-misconduct')),
          ...when(!support && Boolean(n.caseTeam), L('desk-cases', 'Cases', '/yx/desk/cases', 'casesOpen')),
          ...when(!support && Boolean(n.ethicsDesk), L('desk-ethics', 'Ethics desk', '/yx/desk/ethics', 'ethicsReports')),
          ...when(!support && Boolean(n.icMember), L('desk-ic', 'Internal Committee', '/yx/desk/ic', 'icComplaints')),
          ...when(has('speakup.setup.manage'), L('desk-speakup-setup', 'Speak-up set-up', '/yx/desk/speakup-setup')),
          ...when(any('policy.manage', 'policy.publish'), L('desk-policy-admin', 'Policy admin', '/yx/desk/policy-admin')),
          // HLP-14: a policy manager drafts a policy from a questionnaire (the company's AI, or a starter when AI is off).
          ...when(has('policy.manage'), L('desk-policy-writer', 'Write policies with AI', '/yx/desk/policy-writer')),
          L('desk-catalog', 'Service catalogue', '/yx/desk/catalog'),
          L('desk-chat', 'Chat with us', '/yx/desk/chat'),
          ...when(has('desk.chat.work'), L('desk-live-chat', 'Live chat', '/yx/desk/live-chat')),
          ...when(has('desk.ticket.view'), L('desk-calendar', 'My calendar', '/yx/desk/calendar'), L('desk-known-issues', 'Known issues', '/yx/desk/known-issues')),
          ...when(any('desk.ticket.work', 'desk.report.view'), L('desk-team', 'Team and shifts', '/yx/desk/team')),
          ...when(any('desk.customer.manage', 'desk.ticket.view'), L('desk-customers', 'Customers', '/yx/desk/customers')),
          ...when(any('desk.report.view', 'desk.survey.manage'), L('desk-reports', 'SLAs', '/yx/desk/reports')),
          ...when(has('desk.directory.manage'), L('desk-people-list', 'People list', '/yx/desk/people-list')),
          // Helpdesk plan item 3: the company's business applications and their owners (desk staff read, the owner edits).
          ...when(any('desk.desk.create', 'desk.ticket.view'), L('desk-apps', 'Applications', '/yx/desk/apps')),
          // Helpdesk ITSM-2: IT changes (the page shows them to the IT desks' agents, leads and admins only).
          ...when(has('desk.ticket.view') || Boolean(n.changesAsked), L('desk-changes', 'Changes', '/yx/desk/changes', n.changesAsked ? 'changesAsked' : undefined)),
          // ITSM-3: IT problems (the page shows them to the IT desks' agents, leads and admins only).
          ...when(has('desk.ticket.view'), L('desk-problems', 'Problems', '/yx/desk/problems')),
          // IT assets (answer 2710): one register; desk agents who hold asset.view reach the same page from here.
          ...when(has('desk.ticket.view') && has('asset.view'), L('desk-it-assets', 'IT assets', '/yx/people/assets')),
          ...when(has('desk.ticket.view') && has('asset.view'), L('desk-it-suppliers', 'IT suppliers', '/yx/people/assets/suppliers')),
          ...when(has('desk.ticket.view') && has('asset.view'), L('desk-it-contracts', 'IT contracts', '/yx/people/assets/contracts')),
          ...when(has('desk.ticket.view') && has('asset.view'), L('desk-it-licences', 'IT licences', '/yx/people/assets/licences')),
          ...when(has('desk.ticket.view') && has('asset.view'), L('desk-it-bookings', 'IT bookings', '/yx/people/assets/bookings')),
          // Helpdesk plan item 4: buildings, areas and equipment (the facilities desks' staff; their admins edit).
          ...when(any('desk.desk.create', 'desk.ticket.view'), L('desk-facilities', 'Buildings and equipment', '/yx/desk/facilities')),
          ...when(has('desk.desk.create'), L('desk-privacy', 'Privacy requests', '/yx/desk/privacy')),
          ...when(deskSetup, L('desk-setup', 'Desk set-up', '/yx/desk/setup')),
        ]),
  };

  // Contract labour CL-1 (CLB-01): contractors working at the company's sites, for the contractor keys (whole company).
  const contract: NavArea = {
    id: 'contract',
    title: 'Contract labour',
    sections: support ? [] : sec(undefined, when(any('clra.contractor.manage', 'clra.contractor.view'), L('clra-contractors', 'Contractors', '/yx/contract-labour/contractors'), L('clra-workers', 'Contract workers', '/yx/contract-labour/workers'), L('clra-attendance', 'Attendance', '/yx/contract-labour/attendance'), L('clra-compliance', 'Vendor compliance', '/yx/contract-labour/compliance'), L('clra-registers', 'CLRA registers & returns', '/yx/contract-labour/registers'))),
  };
  // CL-8 (CLB-06 … 08): we are the contractor, our employees at clients' sites.
  if (!support) contract.sections.push(...sec('We are the contractor', when(any('clra.contractor.manage', 'clra.contractor.view'), L('clra-client-sites', 'Client establishments', '/yx/contract-labour/client-sites'), L('clra-own-licences', 'Own licences', '/yx/contract-labour/own-licences'), L('clra-client-packs', 'Client compliance packs', '/yx/contract-labour/client-packs'))));

  // Visitors slice 1 (M02 §B11): hosts invite their own visitors; reception runs the desk; the log (answers 601-617).
  const visitors: NavArea = {
    id: 'visitors',
    title: 'Visitors',
    sections: [
      ...sec(undefined, [
        ...when(!support && has('visitors.desk.manage'), L('visitors-desk', "Today's visitors", '/yx/visitors')),
        ...when(self, L('visitors-invites', 'My visitors', '/yx/visitors/invites')),
        ...when(!support && any('visitors.log.view', 'visitors.desk.manage'), L('visitors-log', 'Visitor log', '/yx/visitors/log')),
        // Slice 3 (answer 605): the watch-list, for HR and Facility admins only.
        ...when(!support && has('visitors.watchlist.manage'), L('visitors-watchlist', 'Watch-list', '/yx/visitors/watchlist')),
        // Slice 4 (answer 612): the emergency roll-call for reception, security and HR.
        ...when(!support && any('visitors.rollcall.view', 'visitors.desk.manage'), L('visitors-rollcall', 'Roll-call', '/yx/visitors/rollcall')),
      ]),
    ],
  };

  // Engage (batch G2, M09): the feed for everyone with a job; announcements for engage.announce (never on a support session).
  const engage: NavArea = {
    id: 'engage',
    title: 'Engage',
    sections: sec(undefined, [
      ...when(!support && employee, L('engage-feed', 'Feed', '/yx/engage')),
      // Batch G2 item 73: kudos (badges only).
      ...when(!support && employee, L('engage-recognition', 'Recognition', '/yx/engage/recognition')),
      // Batch G2 item 74: company surveys (the key), or a manager's own team results.
      ...when(!support && has('engage.survey.manage'), L('engage-surveys', 'Surveys', '/yx/engage/surveys')),
      ...when(!support && manager && !has('engage.survey.manage'), L('engage-team-surveys', 'Team surveys', '/yx/engage/team-surveys')),
      ...when(!support && has('engage.announce'), L('engage-announcements', 'Announcements', '/yx/engage/announcements')),
      // Batch G2 item 100: the moderation queue (held, reported and waiting posts).
      ...when(!support && has('engage.moderate'), L('engage-moderation', 'Moderation', '/yx/engage/moderation')),
    ]),
  };

  // Projects P-1 (answer 1401): only once the company switched Projects on.
  const projects: NavArea = { id: 'projects', title: 'Projects', sections: sec(undefined, [...when(!support && Boolean(n.projects), L('projects', 'Projects', '/yx/projects')), ...when(!support && Boolean(n.projects), L('capacity', 'Capacity & utilisation', '/yx/projects/capacity'), L('resource-requests', 'Resource requests', '/yx/projects/requests')), ...when(!support && Boolean(n.projects) && has('projects.finance'), L('costs', 'Costing & margin', '/yx/projects/costs')), ...when(!support && Boolean(n.projects) && any('projects.finance', 'ats.staffing.manage'), L('billing', 'Billing workbench', '/yx/projects/billing')), ...when(!support && (Boolean(n.projects) || Boolean(n.lineApprovals)), L('timesheet-approvals', 'Timesheet approvals', '/yx/projects/approvals'))]) };

  // Settings, pinned at the bottom of the rail, in the designed settings groups.
  const settings: NavArea = {
    id: 'settings',
    title: 'Settings',
    sections: [
      ...sec('Organisation', [
        ...when(settingsAdmin, L('setup-hub', 'Set-up hub', '/yx/settings/setup-hub')),
        ...when(orgPages, L('entities', 'Legal entities', '/yx/settings/legal-entities'), L('locations', 'Locations', '/yx/settings/locations'), L('structure', 'Structure', '/yx/settings/structure')),
        ...when(settingsAdmin, L('countries', 'Countries', '/yx/settings/countries'), L('translations', 'Translations', '/yx/settings/translations')),
        // S-7 (answer 1321): the Organisation, Documents and Account settings pages (Company rules retired).
        ...when(settingsView, ...MORE_SETTINGS_PAGES.map(([id, label, folder, slug]) => L(`more-settings-${id}`, label, `${SETTINGS_HOME}/${folder}/${slug}`))),
        ...when(has('perf.setup.manage'), L('performance-setup', 'Performance', '/yx/settings/performance')),
        // S-8 (answer 1323): the company's expense and performance choices (4.8, 6.3); their set-up keys change them too.
        ...when(settingsView || has('expense.policy.manage') || has('expense.policy.view'), L('expense-settings', 'Expense settings', `${SETTINGS_HOME}/finance/expenses-and-travel`)),
        ...when(settingsView || has('perf.setup.manage'), L('performance-settings', 'Performance settings', `${SETTINGS_HOME}/talent/performance`)),
        // AS-2 (Settings 6.5): the company's assessment defaults; test owners with the assessments settings key too.
        ...when(settingsView || has('assessments.settings.manage'), L('assessment-settings', 'Assessment settings', `${SETTINGS_HOME}/talent/assessments`)),
        // S-10 (answer 1327): Integrations, AI and Developers for System Admins; everyone's own calendar.
        ...when((has('org:manage_settings') || has('integration.manage')) && !support, L('integrations', 'Integrations', `${SETTINGS_HOME}/integrations/integrations`), L('ai-settings', 'AI', `${SETTINGS_HOME}/integrations/ai`), L('developers', 'Developers', `${SETTINGS_HOME}/integrations/developers`)),
        ...when(!support && (has('org:manage_settings') || has('integration.manage') || Boolean(n.panellist) || any('interview:view_assigned', 'pipeline:manage')), L('calendar-and-chat', 'Calendar & chat', `${SETTINGS_HOME}/integrations/calendar-and-chat`)),
        // S-9 (answers 1328, 1332): the plan, usage and invoices (read-only) and, for System Admins, export and closure.
        ...when(has('org:manage_billing') || has('billing.view'), L('plan', 'Plan & add-ons', `${SETTINGS_HOME}/account/plan-and-add-ons`), L('usage', 'Usage & caps', `${SETTINGS_HOME}/account/usage-and-caps`), L('invoices', 'Invoices', `${SETTINGS_HOME}/account/invoices-and-payment`)),
        ...when(has('org:manage_billing') && n.role === 'org_admin' && !support, L('data-export', 'Data export & closure', `${SETTINGS_HOME}/account/data-export-and-closure`)),
      ]),
      ...sec('People & Access', [
        ...when(has('access.role.manage'), L('access', 'Roles & access', '/yx/settings/access')),
        ...when(settingsAdmin, L('custom-fields', 'Custom fields', '/yx/settings/custom-fields')),
        // S-4 (answer 1323): the People & Access settings pages; HR's settings key changes them.
        ...when(settingsView, ...PEOPLE_SETTINGS_PAGES.map(([id, label, slug]) => L(`people-settings-${id}`, label, `${SETTINGS_HOME}/people/${slug}`))),
        // S-6 (answer 1330): the approval policy editor, beside 2.4 Approvals.
        ...when(settingsView, L('approval-policies', 'Approval policies', '/yx/settings/approval-policies')),
        // Answer 1563: the company audit log.
        ...when(has('audit.view') && !support, L('audit-log', 'Audit log', AUDIT_LOG)),
        // Batch B item 3 (admin B2): deleted records across YukthiX, restorable until the company's keep days pass.
        ...when((settingsAdmin || has('org:manage_settings')) && !support, L('recycle-bin', 'Recycle bin', '/yx/settings/recycle-bin')),
        ...when(has('lifecycle.journey.template.manage'), L('checklists', 'Onboarding checklists', '/yx/settings/checklists')),
        ...when(adminRole, L('settings', 'Security settings', '/yx/settings/security'), L('identity-providers', 'Single sign-on providers', '/yx/settings/identity-providers')),
        ...when(adminRole || n.role === 'auditor', L('activity', 'Login activity', '/yx/admin/login-activity')),
        ...when(has('org.support_access.approve') && !support, L('support-access', 'Support access', '/yx/settings/support-access')),
      ]),
      // 3.12 Visitors: Facility admins and HR change it; reception reads it.
      // 3.11 Projects & timesheets: where Projects is switched on, so it shows while Projects is off (answer 1401).
      ...sec('Time & Leave', [
        // S-2 (answer 1323): the Time & Leave settings pages; HR's settings key changes them. 3.11 is the Projects page.
        // Answer 1333: Time admins (leave.settings.manage) open every Time & Leave page; they change only the leave pages
        // (3.6, 3.8, 3.9, answer 1485) and read the others.
        ...TIME_SETTINGS_PAGES.filter(() => settingsAdmin || has('leave.settings.manage')).map(([id, label, slug]) => L(`time-settings-${id}`, label, `${SETTINGS_HOME}/time/${slug}`)),
        ...when(!support && any('org.settings.manage', 'projects.manage'), L('project-settings', 'Projects & timesheets', '/yx/settings/projects')),
        // P-3 (PRJ-08): the mapping rules, once Projects is on for this person (also linked from 3.11).
        ...when(!support && Boolean(n.projects) && any('org.settings.manage', 'projects.manage'), L('mapping-rules', 'Timesheet mapping rules', '/yx/settings/projects/mapping-rules')),
        ...when(!support && any('visitors.settings.manage', 'org.settings.manage', 'visitors.desk.manage'), L('visitor-settings', 'Visitors', '/yx/settings/visitors')),
      ]),
      ...sec('Payroll & Statutory', [
        ...when(pay, ...[
          ...when(any('payroll.setup.manage', 'payroll.statutory.setup'), L('pay-setup', 'Payroll set-up', '/yx/payroll/setup')),
          // S-3 (answers 1323 to 1325): HR changes them (a second person approves); payroll set-up reads them.
          ...when(any('payroll.setup.manage', 'org.settings.manage'), ...PAY_SETTINGS_PAGES.map(([id, label, slug]) => L(`pay-settings-${id}`, label, `${SETTINGS_HOME}/payroll/${slug}`))),
          ...when(has('payroll.setup.manage'), L('pay-groups', 'Pay groups', '/yx/payroll/pay-groups'), L('pay-layout', 'Payslip layout', '/yx/payroll/payslip-layout'), L('pay-country-packs', 'Country packs', '/yx/payroll/country-packs')),
          ...when(any('payroll.setup.manage', 'payroll.run.view', 'payroll.run.prepare', 'payroll.run.approve'), L('pay-budget', 'Payroll budget', '/yx/payroll/budget')),
          ...when(has('payroll.component.manage'), L('pay-components', 'Component library', '/yx/payroll/components')),
          ...when(has('payroll.template.manage'), L('pay-templates', 'Salary templates', '/yx/payroll/templates')),
          ...when(has('payroll.import.run'), L('pay-imports', 'Import old payroll', '/yx/payroll/imports')),
          // Enterprise E4 (O19): which ledger account each pay line goes to (payroll's ledger key).
          ...when(has('payroll.ledger.manage'), L('pay-ledger', 'Ledger mapping', '/yx/payroll/accounting')),
        ]),
        // Settings 4.9 Contract labour (CL-1): no payroll needed.
        ...when(!support && any('clra.settings.manage', 'clra.contractor.manage', 'clra.contractor.view', 'org.settings.manage'), L('clra-settings', 'Contract labour', '/yx/settings/contract-labour')),
        ...when(!support && any('benefits.settings.manage', 'org.settings.manage'), L('benefits-settings', 'Benefits & FBP', '/yx/settings/benefits')),
      ]),
      // Settings 6.1 Hiring: recruiting, hiring admins and HR read it; the hiring settings key changes it.
      ...sec('Hiring & Assessments', [
        ...when(!support && any('ats.settings.manage', 'org.settings.manage', 'pipeline:manage', 'pipelines:configure', 'ats.headcount.manage', 'ats.referral.manage'), L('hiring-settings', 'Hiring', '/yx/settings/hiring')),
        // 6.2: where the desk is turned on, so it shows to the settings holders even while it is off.
        ...when(!support && any('ats.staffing.manage', 'org.settings.manage'), L('staffing-settings', 'Staffing desk', '/yx/settings/staffing')),
      ]),
      ...sec('Documents & Communication', [
        ...when(any('letter.template.manage', 'letter.signatory.manage'), L('letter-templates', 'Letter templates', '/yx/settings/letters')),
        ...when(has('notification.template.manage') || support, L('emails', 'Emails', '/yx/settings/emails')),
        ...when(adminRole, L('sms', 'Text messages (SMS)', '/yx/settings/sms')),
      ]),
      // SD-1.31: the System Admin writes to YukthiX support (never on a support session).
      ...sec('Billing & Account', when(has('org.yukthix_support.raise') && !support, L('yukthix-support', 'Contact YukthiX', '/yx/support'))),
    ],
  };

  // G4 (ANL-06): the report library, for anyone a report opens for (an area report key, or a manager's team reports).
  const analytics: NavArea = {
    id: 'analytics',
    title: 'Analytics',
    sections: sec(undefined, [
      ...when(!support && (manager || REPORT_KEYS.some(has)), L('report-library', 'Report library', '/yx/analytics/reports')),
      // Answers 2690-2692: scheduled report emails (report keys) and the export log (exports.log.view).
      ...when(!support && (REPORT_KEYS.some(has) || has('exports.log.view')), L('report-schedules', 'Schedules and exports', '/yx/analytics/schedules')),
    ]),
  };
  const areas = [home, people, time, pays, compliance, contract, hire, projects, performance, learning, helpdesk, engage, visitors, analytics, settings];
  // Settings S-1 (answer 1322): Settings opens the home, for anyone who may open at least one settings page.
  const mine = new Set(areas.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.href))));
  if (Object.values(SETTINGS_PAGE_EDITORS).some((hrefs) => hrefs.some((h) => mine.has(h)))) settings.sections.unshift({ items: [L('settings-home', 'All settings', SETTINGS_HOME)] });
  return areas.filter((a) => a.sections.some((s) => s.items.length));
}

/** The area and link a path belongs to: the longest link that is the path or a parent of it. A page linked from two
 * areas (People › F&F is Payroll's page) belongs to the area whose own paths it is under. */
export function activeLink(areas: NavArea[], pathname: string): { area: NavArea; link: NavLink } | null {
  let best: { area: NavArea; link: NavLink } | null = null;
  const home = (a: NavArea) => pathname.startsWith(`/yx/${a.id}`);
  for (const area of areas)
    for (const s of area.sections)
      for (const link of s.items)
        if ((pathname === link.href || pathname.startsWith(`${link.href}/`)) && (!best || link.href.length > best.link.href.length || (link.href.length === best.link.href.length && home(area) && !home(best.area)))) best = { area, link };
  return best;
}

/** Every page of the menu, as if one person held every key: names a page the viewer's own menu has no entry for. */
let every: NavArea[] | null = null;
const everyPage = () => (every ??= buildNav({ has: () => true, role: null, support: false, employee: true, manager: true, history: true, clearance: true, tasks: true, firstDays: true, samePerson: true, designated: true, caseTeam: true, ethicsDesk: true, icMember: true }));

/**
 * The page for the breadcrumb and the menu highlight (walk-through 3 Nov 2026). The viewer's own deepest entry, unless a
 * deeper page exists that their menu lacks (a direct address such as /yx/performance/disputes for an employee): then
 * that page's own name, with nothing highlighted, instead of the area's first page.
 */
export function pageLink(areas: NavArea[], pathname: string): { area: NavArea; link: NavLink; inMenu: boolean } | null {
  const mine = activeLink(areas, pathname);
  const any = activeLink(everyPage(), pathname);
  if (!any || (mine && mine.link.href.length >= any.link.href.length)) return mine ? { ...mine, inMenu: true } : null;
  const area = areas.find((a) => a.id === any.area.id) ?? mine?.area;
  return area ? { area, link: any.link, inMenu: false } : null;
}

/**
 * The avatar menu's personal settings (founder decisions 15 and 26 Oct 2026): delegation, notification preferences, my
 * assets (the Me menu in the design has no place for them), language and my security.
 */
export function accountLinks(n: Pick<NavInput, 'support' | 'employee'>): NavLink[] {
  return [
    ...when(!n.support, L('delegation', 'Delegation', '/yx/me/delegation'), L('notification-prefs', 'Notification preferences', '/yx/me/notifications')),
    // IT assets answer 2715: booking a spare laptop or projector sits with my assets (my own things, not a Helpdesk request).
    ...when(n.employee, L('my-assets', 'My assets', '/yx/me/assets'), L('my-bookings', 'Asset bookings', '/yx/me/bookings'), L('my-language', 'Language', '/yx/me/language')),
    L('me', 'My security', ME_SECURITY),
  ];
}

/** The menu plus the avatar menu's pages under Account, so the command palette still finds them. */
export const withAccount = (areas: NavArea[], n: Pick<NavInput, 'support' | 'employee'>): NavArea[] => areas.map((a) => (a.id === 'home' ? { ...a, sections: [...a.sections, { label: 'Account', items: accountLinks(n) }] } : a));
