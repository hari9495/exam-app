// P02 §4.2 role templates, shipped in code (restorable by definition) and cloned by a company into its own
// roles (permission profiles), then edited or built from scratch (Q5). Only keys that exist today are listed;
// each module adds its keys to the templates as it is built. Roles are data: business logic checks keys,
// never these names (YX-SEC-02).

export interface RoleTemplate {
  key: string;
  name: string;
  /** Where the role is usually granted (P02 §4.2 "Typical scope"). */
  typicalScope: 'tenant' | 'legal_entity' | 'location' | 'all_reports';
  summary: string;
  /** What it may not do by default (§4.2), said plainly for the role screen. */
  cannot: string;
  permissions: readonly string[];
}

const HR_VIEW = ['org.structure.view', 'employee.profile.view'];
// M02 leave and attendance (step 4): HR reads in scope; HR Admin also sets up, adjusts, approves and handles Special
// medical data.
const TIME_HR_VIEW = ['leave.view', 'attendance.view'];
// Batch 2: rosters in scope (HR Executive too), locking attendance months and maternity / paternity overrides (HR Admin).
const TIME_HR_ADMIN = [...TIME_HR_VIEW, 'leave.settings.manage', 'leave.balance.adjust', 'leave.approve', 'leave.medical.view', 'roster.manage', 'attendance.lock', 'leave.eligibility.override'];

// M14 §6.1 Service Desk roles (phase 3b-1 keys). A desk key reaches only the desks where the person holds a seat
// (sd_desk_members), so these are granted company-wide; replying and owning also need an agent or lead seat (§6.3).
// M03 batch 5a (§6.1–6.2): pay periods and reopen, corrections, pay documents, exchange files and the audit log.
const PAY_ADMIN_5A = ['payroll.period.view', 'payroll.period.reopen', 'payroll.correction.approve', 'payroll.document.view', 'payroll.document.issue', 'payroll.file.view', 'audit.view'];
// M03 batch 5b (§6.2): set-up, statutory registrations, components, templates and imports.
const PAY_ADMIN_5B = ['payroll.setup.manage', 'payroll.statutory.setup', 'payroll.component.manage', 'payroll.template.manage', 'payroll.import.run'];
// M03 batch 5c (§6.1–6.2): runs, inputs, holds, loans, journals; approving a run is for approvers, never the preparer.
const PAY_ADMIN_5C = ['payroll.run.view', 'payroll.run.prepare', 'payroll.input.manage', 'payroll.hold.manage', 'payroll.loan.manage', 'payroll.journal.export', 'payroll.cost_rate.view'];
// Batch 5d: bank files (generate), payment results, cash / cheque register, publishing payslips, payslip queries.
const PAY_ADMIN_5D = ['payroll.bankfile.generate', 'payroll.payment.record', 'payroll.payslip.publish', 'payroll.query.handle'];
// Batch 5e: tax workspaces, proof verification (never one's own), regime changes after the cut-off.
const PAY_ADMIN_5E = ['tax.workspace.view', 'tax.proof.verify', 'tax.regime.override', 'payroll.ledger.manage'];
const PAY_APPROVER_5A = ['payroll.period.view', 'payroll.period.reopen', 'payroll.document.view', 'payroll.file.view', 'payroll.file.release'];

const DESK_AGENT = ['desk.ticket.view', 'desk.ticket.work', 'desk.ticket.note', 'desk.ticket.export', 'desk.task.work', 'desk.kb.view_internal', 'desk.kb.author', 'desk.chat.work', 'desk.hr_summary.view', 'desk.ticket.move'];

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'hr_admin',
    name: 'HR Admin',
    typicalScope: 'legal_entity',
    summary: 'All HR records, job changes, personal details and identity changes for the people in scope; leave and attendance set-up, balances and medical leave.',
    cannot: 'Pay, Aadhaar in full, payroll approval.',
    permissions: [...HR_VIEW, 'org.settings.manage', 'employee.change.manage', 'employee.change.approve', 'employee.change.retro', 'employee.personal.view', 'employee.profile.edit', 'employee.identity.view', 'employee.identity.manage', 'request.raise_on_behalf', ...TIME_HR_ADMIN],
  },
  {
    key: 'hr_executive',
    name: 'HR Executive',
    typicalScope: 'location',
    summary: 'Day-to-day HR work: records, job changes and personal details for the people in scope.',
    cannot: 'Pay, identity and bank details, approvals.',
    permissions: [...HR_VIEW, 'employee.change.manage', 'employee.personal.view', 'employee.profile.edit', ...TIME_HR_VIEW, 'roster.manage'],
  },
  {
    key: 'payroll_admin',
    name: 'Payroll Admin',
    typicalScope: 'legal_entity',
    summary: 'Pay, pay ranges, entity tax identifiers, and approving bank and identity changes.',
    cannot: 'HR settings.',
    permissions: [...HR_VIEW, 'employee.change.manage', 'employee.change.approve', 'employee.salary.view', 'employee.salary.manage', 'employee.identity.view', 'employee.identity.approve', 'pay.range.view', 'pay.range.manage', 'org.entity.statutory.manage', ...PAY_ADMIN_5A, ...PAY_ADMIN_5B, ...PAY_ADMIN_5C, ...PAY_ADMIN_5D, ...PAY_ADMIN_5E],
  },
  {
    key: 'payroll_approver',
    name: 'Payroll Approver',
    typicalScope: 'legal_entity',
    summary: 'Checks and approves pay changes, bank account changes and payroll files prepared by others; the first check of a request to reopen a locked month.',
    cannot: 'Prepare pay changes.',
    permissions: [...HR_VIEW, 'employee.change.approve', 'employee.salary.view', 'employee.identity.view', 'employee.identity.approve', ...PAY_APPROVER_5A, 'payroll.run.view', 'payroll.run.approve', 'payroll.loan.approve', 'payroll.bankfile.release', 'payroll.payment_mode.approve'],
  },
  {
    key: 'finance',
    name: 'Finance',
    typicalScope: 'legal_entity',
    summary: 'Structure, cost centres and pay ranges for cost reports.',
    cannot: 'Individual salaries and identity details.',
    permissions: ['org.structure.view', 'pay.range.view'],
  },
  {
    key: 'finance_approver',
    name: 'Finance Approver',
    typicalScope: 'legal_entity',
    summary: 'The final approval to reopen a locked pay month; releases payroll files prepared by others.',
    cannot: 'Prepare pay, or see individual tax workspaces.',
    permissions: ['org.structure.view', 'payroll.period.view', 'payroll.period.reopen.approve', 'payroll.file.view', 'payroll.file.release', 'payroll.run.view', 'payroll.run.approve', 'payroll.journal.export', 'payroll.cost_rate.view', 'payroll.bankfile.release'],
  },
  {
    key: 'compliance_owner',
    name: 'Compliance Owner',
    typicalScope: 'legal_entity',
    summary: 'Statutory files, registers and pay documents of the entity, and its audit log.',
    cannot: 'Change pay.',
    permissions: ['org.structure.view', 'payroll.period.view', 'payroll.file.view', 'payroll.document.view', 'audit.view', 'payroll.statutory.setup'],
  },
  {
    key: 'payroll_auditor',
    name: 'Payroll Auditor',
    typicalScope: 'legal_entity',
    summary: 'Reads pay periods, pay documents, payroll files and the audit log, and exports it. Grant it with an end date (YX-SEC-15).',
    cannot: 'Any change.',
    permissions: ['org.structure.view', 'payroll.period.view', 'payroll.document.view', 'payroll.file.view', 'audit.view', 'audit.export', 'payroll.run.view'],
  },
  {
    key: 'team_salary',
    name: 'Team salary view',
    typicalScope: 'all_reports',
    summary: 'Salaries of everyone below the holder (P02 Q3), e.g. for department heads.',
    cannot: 'Change pay.',
    permissions: ['employee.salary.view'],
  },
  {
    key: 'manager_raise',
    name: 'Manager · raise changes',
    typicalScope: 'all_reports',
    summary: 'Raise promotions, transfers and manager changes for one’s team (HR approves).',
    cannot: 'Approve, or change pay.',
    permissions: ['org.structure.view', 'request.raise_on_behalf'],
  },
  {
    key: 'auditor',
    name: 'Auditor',
    typicalScope: 'tenant',
    summary: 'Read-only structure and job records. Grant it with an end date (YX-SEC-15).',
    cannot: 'Any change.',
    permissions: HR_VIEW,
  },
  {
    key: 'service_desk_admin',
    name: 'Service Desk Admin',
    typicalScope: 'tenant',
    summary: 'Creates desks, hands out agent seats (the cost is shown first), sets up every desk, its mailboxes, portals, customers and help articles, the service catalogue, automation rules and webhooks, the people list and directory sync, reports, surveys and privacy requests.',
    cannot: 'See tickets without a seat on the desk, or private and sensitive tickets.',
    permissions: ['desk.desk.create', 'desk.settings.manage', 'desk.member.manage', 'desk.sla.manage', 'desk.mailbox.manage', 'desk.portal.manage', 'desk.customer.manage', 'desk.kb.view_internal', 'desk.kb.publish', 'desk.report.view', 'desk.report.manage', 'desk.survey.manage', 'desk.directory.manage', 'desk.catalog.manage', 'desk.rule.manage', 'desk.integration.manage', 'desk.lifecycle.manage', 'desk.channel.manage'],
  },
  {
    key: 'desk_admin',
    name: 'Desk Admin',
    typicalScope: 'tenant',
    summary: 'Sets up the desks where they hold an admin seat: groups, categories, statuses, saved replies, calendars, mailboxes, portals, catalogue items and automation rules.',
    cannot: 'Answer tickets, see private and sensitive tickets, or set up webhooks.',
    permissions: ['desk.ticket.view', 'desk.settings.manage', 'desk.member.manage', 'desk.sla.manage', 'desk.mailbox.manage', 'desk.portal.manage', 'desk.kb.view_internal', 'desk.report.view', 'desk.catalog.manage', 'desk.rule.manage', 'desk.lifecycle.manage', 'desk.channel.manage'],
  },
  {
    key: 'desk_agent',
    name: 'Desk Agent',
    typicalScope: 'tenant',
    summary: 'Works tickets on the desks where they hold an agent seat: owns, replies, notes, logs time, takes live chats, moves and shares tickets, sees the employee summary (within their HR access).',
    cannot: 'Assign tickets to others, change many at once, or set up the desk.',
    permissions: DESK_AGENT,
  },
  {
    key: 'desk_lead',
    name: 'Desk Team Lead',
    typicalScope: 'tenant',
    summary: 'An agent who also assigns and merges tickets, changes many at once, sees who read a ticket, shows masked values (after a security check), approves SLA exclusions, looks after customer accounts, publishes help articles, runs reports and surveys.',
    cannot: 'Set up the desk.',
    permissions: [...DESK_AGENT, 'desk.ticket.assign', 'desk.ticket.bulk', 'desk.ticket.merge', 'desk.report.view', 'desk.audit.view', 'desk.pii.unmask', 'desk.customer.manage', 'desk.kb.publish', 'desk.report.manage', 'desk.survey.manage'],
  },
  {
    key: 'desk_collaborator',
    name: 'Desk Collaborator',
    typicalScope: 'tenant',
    summary: 'Free. Sees the tickets they are added to and adds internal notes.',
    cannot: 'Reply to the requester, own tickets or see other tickets.',
    permissions: ['desk.ticket.view', 'desk.ticket.note', 'desk.task.work'],
  },
];
