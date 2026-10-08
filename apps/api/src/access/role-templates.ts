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

// M14 §6.1 Service Desk roles (phase 3b-1 keys). A desk key reaches only the desks where the person holds a seat
// (sd_desk_members), so these are granted company-wide; replying and owning also need an agent or lead seat (§6.3).
const DESK_AGENT = ['desk.ticket.view', 'desk.ticket.work', 'desk.ticket.note', 'desk.ticket.export', 'desk.task.work', 'desk.kb.view_internal'];

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'hr_admin',
    name: 'HR Admin',
    typicalScope: 'legal_entity',
    summary: 'All HR records, job changes, personal details and identity changes for the people in scope.',
    cannot: 'Pay, Aadhaar in full, payroll approval.',
    permissions: [...HR_VIEW, 'org.settings.manage', 'employee.change.manage', 'employee.change.approve', 'employee.change.retro', 'employee.personal.view', 'employee.profile.edit', 'employee.identity.view', 'employee.identity.manage', 'request.raise_on_behalf'],
  },
  {
    key: 'hr_executive',
    name: 'HR Executive',
    typicalScope: 'location',
    summary: 'Day-to-day HR work: records, job changes and personal details for the people in scope.',
    cannot: 'Pay, identity and bank details, approvals.',
    permissions: [...HR_VIEW, 'employee.change.manage', 'employee.personal.view', 'employee.profile.edit'],
  },
  {
    key: 'payroll_admin',
    name: 'Payroll Admin',
    typicalScope: 'legal_entity',
    summary: 'Pay, pay ranges, entity tax identifiers, and approving bank and identity changes.',
    cannot: 'HR settings.',
    permissions: [...HR_VIEW, 'employee.change.manage', 'employee.change.approve', 'employee.salary.view', 'employee.salary.manage', 'employee.identity.view', 'employee.identity.approve', 'pay.range.view', 'pay.range.manage', 'org.entity.statutory.manage'],
  },
  {
    key: 'payroll_approver',
    name: 'Payroll Approver',
    typicalScope: 'legal_entity',
    summary: 'Checks and approves pay changes and bank account changes prepared by others.',
    cannot: 'Prepare pay changes.',
    permissions: [...HR_VIEW, 'employee.change.approve', 'employee.salary.view', 'employee.identity.view', 'employee.identity.approve'],
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
    summary: 'Creates desks, hands out agent seats (the cost is shown first) and sets up every desk.',
    cannot: 'See tickets without a seat on the desk, or private and sensitive tickets.',
    permissions: ['desk.desk.create', 'desk.settings.manage', 'desk.member.manage', 'desk.sla.manage'],
  },
  {
    key: 'desk_admin',
    name: 'Desk Admin',
    typicalScope: 'tenant',
    summary: 'Sets up the desks where they hold an admin seat: groups, categories, statuses, saved replies, calendars.',
    cannot: 'Answer tickets, or see private and sensitive tickets.',
    permissions: ['desk.ticket.view', 'desk.settings.manage', 'desk.member.manage', 'desk.sla.manage'],
  },
  {
    key: 'desk_agent',
    name: 'Desk Agent',
    typicalScope: 'tenant',
    summary: 'Works tickets on the desks where they hold an agent seat: owns, replies, notes, logs time.',
    cannot: 'Assign tickets to others, change many at once, or set up the desk.',
    permissions: DESK_AGENT,
  },
  {
    key: 'desk_lead',
    name: 'Desk Team Lead',
    typicalScope: 'tenant',
    summary: 'An agent who also assigns tickets to others, changes many at once and shares views.',
    cannot: 'Set up the desk.',
    permissions: [...DESK_AGENT, 'desk.ticket.assign', 'desk.ticket.bulk', 'desk.ticket.merge', 'desk.report.view'],
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
