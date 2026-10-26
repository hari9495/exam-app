import type { AreaId } from '@yukthix/ui/frame';

// The YukthiX menu by product area (design audit step 1, founder decisions 15 Oct 2026): the designed rail areas,
// each with the designed panel's sections and names where the live page is the same page. Areas with no built page are
// hidden; a link shows only to someone who may open it (the API still checks every call). Pure, so it is unit-tested.

/** Side-menu counts from GET /workspace/counts. */
export type CountKey = 'approvals' | 'notifications' | 'documentsToVerify' | 'exitCases' | 'payslipQueries' | 'myTickets' | 'scorecardsToDo' | 'readyToOnboard' | 'probationsDue' | 'clearanceToDo' | 'possibleSamePerson';

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
}

const L = (id: string, label: string, href: string, count?: CountKey): NavLink => ({ id, label, href, ...(count ? { count } : {}) });
const when = <T,>(ok: boolean, ...items: T[]): T[] => (ok ? items : []);
const sec = (label: string | undefined, items: NavLink[]): NavSection[] => (items.length ? [{ ...(label ? { label } : {}), items }] : []);

export const ME_SECURITY = '/yx/me/security';

export function buildNav(n: NavInput): NavArea[] {
  const { has, support, employee, manager } = n;
  const any = (...keys: string[]) => keys.some(has);
  const self = employee && !support;
  const settingsAdmin = has('org.settings.manage');
  const hr = support || any('employee.profile.view', 'employee.change.manage', 'employee.change.approve');
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
      ]),
      // The designed Me menu (PPL-30 MeFrame, founder 26 Oct 2026). Personal settings are in the avatar menu (accountLinks).
      ...sec('Me', [
        ...when(self && n.firstDays, L('first-30', 'My first 30 days', '/yx/me/first-30-days')),
        ...when(hr || employee, L('profile', 'Profile', '/yx/people/profile')),
        ...when(employee, L('my-documents', 'Documents & letters', '/yx/me/documents'), L('my-data', 'Privacy', '/yx/me/privacy'), L('resign', 'My exit', '/yx/me/resignation')),
      ]),
    ],
  };

  // Managers without HR keys get the designed "For my team" group instead of Onboarding / Changes / Exits.
  const team = !hr;
  const people: NavArea = {
    id: 'people',
    title: 'People',
    sections: [
      ...sec(undefined, [...when(hr || employee, L('directory', 'Directory', '/yx/people/directory'), L('org-chart', 'Org chart', '/yx/people/org-chart')), ...when(manager, L('team', 'My team', '/yx/people/team'))]),
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
        ...when(has('employee.change.manage'), L('import', 'Import', '/yx/people/import')),
        ...when(hr || n.history, L('job-history', 'Job history', '/yx/people/history')),
        ...when(any('employee.identity.approve', 'employee.identity.manage'), L('profile-requests', 'Identity and bank changes', '/yx/people/profile-requests')),
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
        ...when(has('succession.manage'), L('succession', 'Succession', '/yx/people/succession')),
      ]),
      // Founder decision 8 Oct 2026: HR checks people the Service Desk made for logins with no person.
      ...sec('More', [
        ...when(!support && Boolean(n.samePerson), L('desk-people', 'Possible same person', '/yx/desk/people', 'possibleSamePerson')),
        ...when(has('lifecycle.exit.manage'), L('unions', 'Union register', '/yx/people/unions'), L('retrenchment', 'VRS schemes', '/yx/people/retrenchment')),
      ]),
    ],
  };

  const time: NavArea = {
    id: 'time',
    title: 'Time',
    sections: [
      ...sec(undefined, [
        ...when(manager || has('attendance.view'), L('muster', 'Muster', '/yx/time/muster')),
        ...when(manager || has('roster.manage'), L('roster', 'Roster', '/yx/time/roster')),
        ...when(manager || has('leave.view'), L('team-leave', 'Team leave', '/yx/time/team')),
        ...when(manager || has('attendance.view'), L('overtime-review', 'Overtime', '/yx/time/overtime-review')),
        ...when(has('leave.view'), L('leave-balances', 'Leave balances', '/yx/time/balances')),
        ...when(has('attendance.lock'), L('periods', 'Periods', '/yx/time/periods')),
        ...when(has('attendance.view'), L('registers', 'Reports', '/yx/time/registers'), L('payroll-feed', 'Payroll feed', '/yx/time/payroll-feed')),
      ]),
      ...sec('My time', when(self, L('my-attendance', 'My attendance', '/yx/time/attendance'), L('my-leave', 'My leave', '/yx/time/leave'), L('my-shifts', 'My shifts', '/yx/time/shifts'), L('my-timesheet', 'My timesheet', '/yx/time/timesheet'), L('my-overtime', 'My overtime', '/yx/time/overtime'))),
      ...sec('Time settings', when(has('leave.settings.manage'), L('shifts-setup', 'Shifts & patterns', '/yx/time/shifts-setup'), L('time-setup', 'Leave types & policies', '/yx/time/setup'))),
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
            ...when(any('payroll.run.view', 'payroll.run.prepare', 'payroll.run.approve', 'payroll.offcycle.prepare'), L('pay-runs', 'Runs', '/yx/payroll/runs')),
            ...when(has('payroll.input.manage'), L('pay-inputs', 'Inputs', '/yx/payroll/inputs')),
            ...when(has('payroll.query.handle'), L('pay-queries', 'Queries', '/yx/payroll/payslip-queries', 'payslipQueries')),
            ...when(any('payroll.fnf.manage', 'payroll.notice.waive'), L('pay-fnf', 'Full and final', '/yx/payroll/fnf')),
            ...when(any('payroll.period.view', 'payroll.period.reopen', 'payroll.period.reopen.approve'), L('pay-periods', 'Pay periods', '/yx/payroll/periods'), L('reopen-requests', 'Reopen requests', '/yx/payroll/reopen-requests')),
            ...when(any('payroll.run.prepare', 'payroll.setup.manage'), L('pay-go-live', 'Go-live readiness', '/yx/payroll/go-live')),
          ]),
          ...sec(undefined, [
            ...when(has('employee.salary.manage'), L('pay-compensation', 'Compensation', '/yx/payroll/compensation')),
            ...when(has('payroll.special.manage'), L('pay-special', 'One-time pay & holds', '/yx/payroll/special-pay')),
            ...when(has('payroll.equity.manage'), L('pay-equity', 'Equity', '/yx/payroll/equity')),
            ...when(any('consultant.manage', 'consultant.invoice.approve'), L('pay-consultants', 'Consultants', '/yx/payroll/consultants')),
            ...when(has('tax.proof.verify'), L('pay-proofs', 'Tax centre', '/yx/payroll/proofs')),
          ]),
          ...sec('Loans, recoveries & EWA', [
            ...when(has('payroll.loan.manage'), L('pay-loans', 'Loans and advances', '/yx/payroll/loans')),
            ...when(any('payroll.arrears.approve', 'payroll.writeoff.approve'), L('pay-arrears', 'Arrears and recoveries', '/yx/payroll/arrears')),
            ...when(has('payroll.ewa.manage'), L('pay-ewa', 'Earned wage access', '/yx/payroll/ewa')),
          ]),
          // Founder decision 15 Oct 2026: Expenses sit under Pay.
          ...sec('Expenses & advances', [
            ...when(employee || has('expense.finance.review'), L('expenses', 'Claims', '/yx/expenses')),
            ...when(has('expense.payout.manage'), L('expense-to-pay', 'To pay', '/yx/expenses/to-pay')),
            ...when(has('expense.report.view'), L('expense-reports', 'Expense reports', '/yx/expenses/reports')),
            ...when(has('expense.policy.manage'), L('expense-setup', 'Expense policy', '/yx/settings/expenses')),
          ]),
          ...sec('Payments & files', [
            ...when(has('payroll.payment.record'), L('pay-modes', 'Payment modes', '/yx/payroll/payment-modes')),
            ...when(has('payroll.file.view'), L('pay-files', 'Payroll files', '/yx/payroll/files')),
            ...when(has('payroll.document.view'), L('pay-documents', 'Pay documents', '/yx/payroll/documents')),
          ]),
          ...sec('Reports', [
            ...when(any('payroll.special.manage', 'payroll.journal.export'), L('pay-actuarial', 'Actuarial valuation', '/yx/payroll/actuarial')),
            ...when(has('audit.view'), L('pay-audit', 'Audit log', '/yx/payroll/audit')),
          ]),
          ...sec('My pay', when(employee, L('my-payslips', 'Payslips', '/yx/me/payslips'), L('my-tax', 'Tax workspace', '/yx/me/tax'), L('my-declarations', 'Tax declarations', '/yx/me/tax-declarations'), L('my-loans', 'Loans & advances', '/yx/me/loans'), L('my-ewa', 'Get paid early', '/yx/me/earned-pay'), L('my-incentives', 'My incentives', '/yx/me/incentives'), L('pay-band', 'My pay band', '/yx/performance/pay-band'), L('my-equity', 'My equity', '/yx/me/equity'), L('my-pay-documents', 'My pay documents', '/yx/me/pay-documents'))),
        ],
  };

  const compliance: NavArea = {
    id: 'compliance',
    title: 'Compliance',
    sections: !pay
      ? []
      : sec(undefined, [
          ...when(has('statutory.filing.view'), L('pay-statutory', 'Statutory hub', '/yx/payroll/statutory')),
          ...when(has('payroll.setup.manage'), L('pay-rules', 'Statutory set-up', '/yx/payroll/statutory-rules'), L('pay-coverage', 'Statutory coverage', '/yx/payroll/coverage')),
          ...when(has('statutory.filing.view'), L('pay-registers', 'Registers', '/yx/payroll/registers')),
          ...when(has('payroll.document.issue'), L('pay-certificates', 'TDS & Form 16', '/yx/payroll/certificates')),
          ...when(any('statutory.filing.view', 'consultant.manage'), L('pay-consultant-tds', 'Consultant TDS returns', '/yx/payroll/consultant-tds')),
          ...when(has('statutory.advisory.review'), L('pay-advisories', 'Rules & updates', '/yx/payroll/advisories')),
        ]),
  };

  // M10 AT1: hiring, for holders of the hiring keys (founder D2); never in a support session (D14). YukthiX Hiring is
  // the only hiring app (founder decision 15 Oct 2026). Assessments, campaigns and the other exam tools are not in YukthiX
  // yet: recruiters now land here, so one link reaches them in the older screens until they are redesigned (19 Oct).
  const hire: NavArea = {
    id: 'hire',
    title: 'Hiring',
    sections: support
      ? []
      : sec(undefined, [
          ...when(has('ats.headcount.manage'), L('hiring-plans', 'Headcount plan', '/yx/hiring/plans')),
          ...when(any('pipeline:manage', 'results:view'), L('hiring-jobs', 'Jobs & requisitions', '/yx/hiring/jobs')),
          ...when(any('interview:view_assigned', 'pipeline:manage'), L('hiring-interviews', 'Interviews', '/yx/hiring/interviews', 'scorecardsToDo')),
          ...when(any('candidate:manage', 'candidate:view'), L('hiring-candidates', 'Candidates & talent CRM', '/yx/hiring/candidates'), L('hiring-pools', 'Talent pools', '/yx/hiring/pools')),
          ...when(has('org:manage_settings'), L('hiring-careers', 'Careers site', '/yx/hiring/careers'), L('hiring-boards', 'Job boards', '/yx/hiring/job-boards')),
          ...when(has('pipelines:configure'), L('hiring-scorecards', 'Scorecards', '/yx/hiring/scorecards')),
          ...when(has('approvals:configure'), L('hiring-approvals', 'Hiring approvals', '/yx/hiring/approval-routes')),
          ...when(has('candidate:data_rights'), L('hiring-retention', 'Candidate data retention', '/yx/hiring/retention')),
          ...when(any('exam:manage', 'question_bank:manage'), L('hiring-older', 'Assessments & more (older screens)', '/v2/today')),
          ...when(has('results:view') && !any('exam:manage', 'question_bank:manage'), L('hiring-results', 'Test results (older screens)', '/v2/panel/reports')),
        ]),
  };

  const performance: NavArea = {
    id: 'performance',
    title: 'Performance',
    sections: sec(undefined, [
      ...when(employee || has('perf.goal.manage'), L('goals', 'Goals', '/yx/performance')),
      ...when(has('perf.goal.view'), L('goal-map', 'Goal map', '/yx/performance/goal-map')),
      ...when(employee, L('reviews', 'Reviews & cycles', '/yx/performance/reviews')),
      ...when(has('perf.cycle.manage'), L('review-cycles', 'Review cycles', '/yx/performance/cycles')),
      ...when(employee, L('feedback', 'Feedback', '/yx/performance/feedback'), L('feedback-tasks', 'Feedback I owe', '/yx/performance/feedback-tasks'), L('one-on-ones', '1:1s', '/yx/performance/one-on-ones')),
      ...when(has('perf.calibration.facilitate'), L('calibration', 'Calibration & comp review', '/yx/performance/calibrations')),
      ...when(any('perf.comp.manage', 'perf.comp.approve'), L('comp-review', 'Comp review', '/yx/performance/comp')),
      ...when(manager || has('perf.pip.manage'), L('pips', 'PIPs', '/yx/performance/pips')),
      ...when(has('perf.concern.seal'), L('reviewer-blocks', 'Reviewer blocks', '/yx/performance/reviewer-blocks')),
      ...when(has('perf.report.view'), L('perf-reports', 'Reports', '/yx/performance/reports')),
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
          L('desk-catalog', 'Service catalogue', '/yx/desk/catalog'),
          L('desk-chat', 'Chat with us', '/yx/desk/chat'),
          ...when(has('desk.chat.work'), L('desk-live-chat', 'Live chat', '/yx/desk/live-chat')),
          ...when(has('desk.ticket.view'), L('desk-calendar', 'My calendar', '/yx/desk/calendar'), L('desk-known-issues', 'Known issues', '/yx/desk/known-issues')),
          ...when(any('desk.ticket.work', 'desk.report.view'), L('desk-team', 'Team and shifts', '/yx/desk/team')),
          ...when(any('desk.customer.manage', 'desk.ticket.view'), L('desk-customers', 'Customers', '/yx/desk/customers')),
          ...when(any('desk.report.view', 'desk.survey.manage'), L('desk-reports', 'Reports', '/yx/desk/reports')),
          ...when(has('desk.directory.manage'), L('desk-people-list', 'People list', '/yx/desk/people-list')),
          ...when(has('desk.desk.create'), L('desk-privacy', 'Privacy requests', '/yx/desk/privacy')),
          ...when(deskSetup, L('desk-setup', 'Desk set-up', '/yx/desk/setup')),
        ]),
  };

  // Settings, pinned at the bottom of the rail, in the designed settings groups.
  const settings: NavArea = {
    id: 'settings',
    title: 'Settings',
    sections: [
      ...sec('Organisation', [
        ...when(orgPages, L('entities', 'Legal entities', '/yx/settings/legal-entities'), L('locations', 'Locations', '/yx/settings/locations'), L('structure', 'Structure', '/yx/settings/structure')),
        ...when(settingsAdmin, L('company-rules', 'Company rules', '/yx/settings/company-rules'), L('countries', 'Countries', '/yx/settings/countries'), L('translations', 'Translations', '/yx/settings/translations')),
        ...when(has('perf.setup.manage'), L('performance-setup', 'Performance', '/yx/settings/performance')),
      ]),
      ...sec('People & Access', [
        ...when(has('access.role.manage'), L('access', 'Roles & access', '/yx/settings/access')),
        ...when(settingsAdmin, L('access-settings', 'Access and privacy', '/yx/settings/access-settings')),
        ...when(has('lifecycle.journey.template.manage'), L('checklists', 'Onboarding checklists', '/yx/settings/checklists')),
        ...when(adminRole, L('settings', 'Security settings', '/yx/settings/security'), L('identity-providers', 'Single sign-on providers', '/yx/settings/identity-providers')),
        ...when(adminRole || n.role === 'auditor', L('activity', 'Login activity', '/yx/admin/login-activity')),
        ...when(has('org.support_access.approve') && !support, L('support-access', 'Support access', '/yx/settings/support-access')),
      ]),
      ...sec('Payroll & Statutory', when(pay, ...[
        ...when(any('payroll.setup.manage', 'payroll.statutory.setup'), L('pay-setup', 'Payroll set-up', '/yx/payroll/setup')),
        ...when(has('payroll.setup.manage'), L('pay-groups', 'Pay groups', '/yx/payroll/pay-groups'), L('pay-layout', 'Payslip layout', '/yx/payroll/payslip-layout'), L('pay-country-packs', 'Country packs', '/yx/payroll/country-packs')),
        ...when(has('payroll.component.manage'), L('pay-components', 'Component library', '/yx/payroll/components')),
        ...when(has('payroll.template.manage'), L('pay-templates', 'Salary templates', '/yx/payroll/templates')),
        ...when(has('payroll.import.run'), L('pay-imports', 'Import old payroll', '/yx/payroll/imports')),
      ])),
      ...sec('Documents & Communication', [
        ...when(any('letter.template.manage', 'letter.signatory.manage'), L('letter-templates', 'Letter templates', '/yx/settings/letters')),
        ...when(has('notification.template.manage') || support, L('emails', 'Emails', '/yx/settings/emails')),
        ...when(adminRole, L('sms', 'Text messages (SMS)', '/yx/settings/sms')),
      ]),
      // SD-1.31: the System Admin writes to YukthiX support (never on a support session).
      ...sec('Billing & Account', when(has('org.yukthix_support.raise') && !support, L('yukthix-support', 'Contact YukthiX', '/yx/support'))),
    ],
  };

  return [home, people, time, pays, compliance, hire, performance, helpdesk, settings].filter((a) => a.sections.some((s) => s.items.length));
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

/**
 * The avatar menu's personal settings (founder decisions 15 and 26 Oct 2026): delegation, notification preferences, my
 * assets (the Me menu in the design has no place for them), language and my security.
 */
export function accountLinks(n: Pick<NavInput, 'support' | 'employee'>): NavLink[] {
  return [
    ...when(!n.support, L('delegation', 'Delegation', '/yx/me/delegation'), L('notification-prefs', 'Notification preferences', '/yx/me/notifications')),
    ...when(n.employee, L('my-assets', 'My assets', '/yx/me/assets'), L('my-language', 'Language', '/yx/me/language')),
    L('me', 'My security', ME_SECURITY),
  ];
}

/** The menu plus the avatar menu's pages under Account, so the command palette still finds them. */
export const withAccount = (areas: NavArea[], n: Pick<NavInput, 'support' | 'employee'>): NavArea[] => areas.map((a) => (a.id === 'home' ? { ...a, sections: [...a.sections, { label: 'Account', items: accountLinks(n) }] } : a));
