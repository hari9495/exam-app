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

/** Not a template: the company role team pay access grants use (employee.salary.view only; its keys cannot be edited). */
export const PAY_ACCESS_ROLE = 'pay_access';

const HR_VIEW = ['org.structure.view', 'employee.profile.view'];
// M02 leave and attendance (step 4): HR reads in scope; HR Admin also sets up, adjusts, approves and handles Special
// medical data.
const TIME_HR_VIEW = ['leave.view', 'attendance.view'];
// M01 lifecycle batch 6a: joiners and their checklists in scope, person documents (each type still needs its class key).
const LIFE_HR_ADMIN = ['lifecycle.onboarding.view', 'lifecycle.onboarding.manage', 'lifecycle.journey.template.manage', 'document.view', 'document.manage', 'lifecycle.bgv.manage', 'letter.template.manage', 'letter.signatory.manage', 'letter.issue', 'lifecycle.exit.view', 'lifecycle.exit.manage', 'lifecycle.exit.confidential.view', 'asset.view', 'payroll.notice.waive'];
const LIFE_HR_EXEC = ['lifecycle.onboarding.view', 'lifecycle.onboarding.manage', 'document.view', 'document.manage', 'letter.issue', 'lifecycle.exit.view'];
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
// Batch 5f: payroll prepares statutory files, challans and returns; the compliance owner files, signs and reviews.
const PAY_ADMIN_5F = ['statutory.filing.view', 'statutory.filing.generate', 'statutory.filing.download', 'statutory.challan.manage'];
const COMPLIANCE_5F = ['statutory.filing.view', 'statutory.filing.generate', 'statutory.filing.download', 'statutory.filing.mark_filed', 'statutory.challan.manage', 'statutory.register.sign', 'statutory.advisory.review'];
// Batch 5g: off-cycle runs, arrears worksheets and F&F settlements; approvers also approve arrears and write off overpayments.
const PAY_ADMIN_5G = ['payroll.offcycle.prepare', 'payroll.arrears.approve', 'payroll.fnf.manage', 'payroll.notice.waive'];
const PAY_APPROVER_5G = ['payroll.arrears.approve', 'payroll.writeoff.approve'];
// Batch 5h: the consultant register and invoices (payroll); approving consultant invoices (approvers, finance).
const PAY_ADMIN_5H = ['consultant.manage'];
const PAY_APPROVER_5H = ['consultant.invoice.approve'];
// Batch 5i: special pay sent to payroll, earned wage access and equity plans (payroll); approvers approve postings with payroll.run.approve.
const PAY_ADMIN_5I = ['payroll.special.manage', 'payroll.ewa.manage', 'payroll.equity.manage'];
const PAY_APPROVER_5A = ['payroll.period.view', 'payroll.period.reopen', 'payroll.document.view', 'payroll.file.view', 'payroll.file.release'];

const DESK_AGENT = ['desk.ticket.view', 'desk.ticket.work', 'desk.ticket.note', 'desk.ticket.export', 'desk.task.work', 'desk.kb.view_internal', 'desk.kb.author', 'desk.chat.work', 'desk.hr_summary.view', 'desk.ticket.move'];

/** The compliance owner's keys (the demo's compliance@ login uses them). */
export const COMPLIANCE_OWNER_5J = ['org:view', 'org.structure.view', 'payroll.period.view', 'payroll.file.view', 'payroll.document.view', 'audit.view', 'payroll.statutory.setup', ...COMPLIANCE_5F];

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'hr_admin',
    name: 'HR Admin',
    typicalScope: 'legal_entity',
    summary: 'All HR records, job changes, personal details and identity changes for the people in scope; leave and attendance set-up, balances and medical leave.',
    cannot: 'Pay, payroll approval.',
    // Founder 27 Oct 2026: HR admins see Special data (the identity panel, Aadhaar in full); every look is recorded.
    // Founder 28 Oct 2026: HR approves a manager's request to see their team's pay (two different HR people).
    permissions: [...HR_VIEW, 'org.settings.manage', 'employee.change.manage', 'employee.change.approve', 'employee.change.retro', 'employee.pay_access.approve', 'employee.personal.view', 'employee.profile.edit', 'employee.identity.view', 'employee.identity.manage', 'employee.identity.approve', 'employee.aadhaar.view', 'request.raise_on_behalf', ...TIME_HR_ADMIN, ...LIFE_HR_ADMIN, 'expense.claim.view', 'perf.goal.view', 'perf.review.view', 'perf.report.view', 'perf.pip.manage'],
  },
  {
    key: 'hr_executive',
    name: 'HR Executive',
    typicalScope: 'location',
    summary: 'Day-to-day HR work: records, job changes and personal details for the people in scope.',
    cannot: 'Pay, identity and bank details, approvals.',
    permissions: [...HR_VIEW, 'employee.change.manage', 'employee.personal.view', 'employee.profile.edit', ...TIME_HR_VIEW, 'roster.manage', ...LIFE_HR_EXEC],
  },
  {
    key: 'payroll_admin',
    name: 'Payroll Admin',
    typicalScope: 'legal_entity',
    summary: 'Pay, pay ranges and entity tax identifiers; reads approved bank details to pay people.',
    // Founder 21 Oct 2026: payroll does not do HR work (job changes, adding people, probation, the annual increment,
    // changing pay) and does not approve bank or identity changes (HR does).
    cannot: 'HR settings, job changes, adding people, probation decisions, approving bank and identity changes.',
    permissions: [...HR_VIEW, 'employee.change.approve', 'employee.salary.view', 'employee.salary.manage', 'employee.identity.view', 'pay.range.view', 'pay.range.manage', 'org.entity.statutory.manage', ...PAY_ADMIN_5A, ...PAY_ADMIN_5B, ...PAY_ADMIN_5C, ...PAY_ADMIN_5D, ...PAY_ADMIN_5E, ...PAY_ADMIN_5F, ...PAY_ADMIN_5G, ...PAY_ADMIN_5H, ...PAY_ADMIN_5I],
  },
  {
    key: 'payroll_approver',
    name: 'Payroll Approver',
    typicalScope: 'legal_entity',
    summary: 'Checks and approves pay changes, bank account changes and payroll files prepared by others; the first check of a request to reopen a locked month.',
    cannot: 'Prepare pay changes.',
    permissions: [...HR_VIEW, 'employee.change.approve', 'employee.salary.view', 'employee.identity.view', ...PAY_APPROVER_5A, 'payroll.run.view', 'payroll.run.approve', 'payroll.loan.approve', 'payroll.bankfile.release', 'payroll.payment_mode.approve', ...PAY_APPROVER_5G, ...PAY_APPROVER_5H],
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
    permissions: ['expense.finance.review', 'expense.payout.manage', 'expense.report.view', 'org.structure.view', 'payroll.period.view', 'payroll.period.reopen.approve', 'payroll.file.view', 'payroll.file.release', 'payroll.run.view', 'payroll.run.approve', 'payroll.journal.export', 'payroll.cost_rate.view', 'payroll.bankfile.release', 'consultant.invoice.approve'],
  },
  {
    key: 'expense_setup',
    name: 'Expense set-up',
    typicalScope: 'tenant',
    summary: 'Expense categories, city tiers, policies and limits, mileage and per-diem rates, and GST registrations (M05).',
    cannot: 'See, approve or pay anyone’s claims.',
    permissions: ['expense.policy.manage'],
  },
  {
    key: 'travel_desk',
    name: 'Travel Desk',
    typicalScope: 'legal_entity',
    summary: 'Adds tickets and hotel bookings to the approved trips of people in scope (M05).',
    cannot: 'Approve trips, or see claims and advances.',
    permissions: ['travel.booking.manage'],
  },
  {
    key: 'performance_setup',
    name: 'Performance set-up',
    typicalScope: 'tenant',
    summary: 'Rating scales, review templates, competencies, the company skills library, goal periods and company and team goals (M06).',
    cannot: 'See anyone’s goals, reviews or ratings.',
    permissions: ['perf.setup.manage', 'perf.goal.manage', 'perf.cycle.manage', 'perf.calibration.facilitate'],
  },
  // M10 AT1 (founder D2): hiring roles on the scoped ats.* keys. Company-wide for now: the hiring screens become
  // scope-aware batch by batch (M10-BUILD-DESIGN §17).
  {
    key: 'recruiter',
    name: 'Recruiter',
    typicalScope: 'tenant',
    summary: 'Jobs, pipelines, candidates, interviews, assessments and offers; hiring reports (M10).',
    cannot: 'See offer pay, erase candidate data, or set headcount budgets.',
    permissions: ['ats.job.manage', 'ats.candidate.manage', 'ats.interview.schedule', 'ats.assessment.view', 'ats.offer.manage', 'ats.report.view'],
  },
  {
    key: 'hiring_manager',
    name: 'Hiring manager',
    typicalScope: 'tenant',
    summary: 'Raises requisitions and follows the candidates and assessment results of the hiring (M10).',
    cannot: 'Change jobs or pipelines, or see offer pay.',
    permissions: ['ats.requisition.raise', 'ats.candidate.view', 'ats.assessment.view'],
  },
  {
    key: 'interview_coordinator',
    name: 'Interview coordinator',
    typicalScope: 'tenant',
    summary: 'Schedules interviews and panels and sees the candidates being interviewed (M10).',
    cannot: 'Move candidates, or see assessment results or offers.',
    permissions: ['ats.interview.schedule', 'ats.candidate.view'],
  },
  {
    key: 'hiring_admin',
    name: 'Hiring admin',
    typicalScope: 'tenant',
    summary: 'Headcount plans and budgets, offer pay, referral rewards, agencies, hiring reports and candidate data rights (M10).',
    cannot: 'Change payroll or employee records.',
    permissions: ['ats.headcount.manage', 'ats.offer.compensation.view', 'ats.referral.manage', 'ats.agency.manage', 'ats.report.view', 'ats.candidate.data_rights'],
  },
  {
    key: 'compliance_owner',
    name: 'Compliance Owner',
    typicalScope: 'legal_entity',
    summary: 'Statutory files, registers and pay documents of the entity, and its audit log.',
    cannot: 'Change pay.',
    permissions: ['org.structure.view', 'payroll.period.view', 'payroll.file.view', 'payroll.document.view', 'audit.view', 'payroll.statutory.setup', ...COMPLIANCE_5F],
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
    key: 'it_admin_coordinator',
    name: 'IT / Admin coordinator',
    typicalScope: 'location',
    summary: 'Sees who joins and when, to get devices, accounts and seats ready. Their tasks reach them through the checklist and the Service Desk.',
    cannot: 'Personal details, documents, pay.',
    permissions: ['org.structure.view', 'lifecycle.onboarding.view', 'asset.view', 'asset.manage'],
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
