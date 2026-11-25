// Roles whose members are restricted to pipeline entries assigned to them,
// their groups, or unassigned, when an org enables record-level visibility.
// Recruiter only: panel access is scoped by interview assignment, not pipeline
// ownership, so hiding entries would strand panelists on candidates they are
// set to interview. Admins/super-admin are exempt.
export const RECORD_VISIBILITY_GOVERNED_ROLES = ['recruiter'] as const;

export function isRecordVisibilityGoverned(role: string | null | undefined): boolean {
  return role != null && (RECORD_VISIBILITY_GOVERNED_ROLES as readonly string[]).includes(role);
}

// ---- P02 §4.3 record scopes for YukthiX people and organisation data -------------------------------

/**
 * Who a role grant covers (P02 §3). `tenant` is the whole company; the others narrow it to an entity, a
 * location, a department subtree, or the grantee's own reports (relative to their employee record), or one named report
 * ('one_report', from a manager's pay access request: that person only, while they report to the grantee).
 * The implicit grants (YX-SEC-04: self, manager, dotted line, department head) are computed, never stored.
 */
export const GRANT_SCOPE_TYPES = ['tenant', 'legal_entity', 'location', 'department_subtree', 'all_reports', 'direct_reports', 'one_report'] as const;
export type GrantScopeType = (typeof GRANT_SCOPE_TYPES)[number];

export interface GrantScope {
  type: GrantScopeType;
  /** The entity, location, department or (one_report) employee; null for tenant and the other report scopes. */
  id: string | null;
}

export const TENANT_SCOPE: GrantScope = Object.freeze({ type: 'tenant', id: null });

/**
 * The scopes a key may be granted at (P02 §4.3). People keys are checked per record, so they narrow to any
 * scope (as does reading the structure); changing organisation data and pay ranges narrows to a legal entity at most (P01 masters are per company or per
 * entity). Every other key works company-wide only: a narrower grant of it confers nothing (fail closed),
 * because the module behind it has no record scope.
 */
export function grantScopesFor(key: string): readonly GrantScopeType[] {
  // Reading the structure masters is Public / Internal configuration every HR screen needs, whatever the scope.
  if (key.startsWith('employee.') || key === 'request.raise_on_behalf' || key === 'org.structure.view') return GRANT_SCOPE_TYPES;
  // HIR-11/12 (founder answers 202, 204): the HR Admin template (typically per legal entity) carries these two; costs and
  // referrals are company-wide, so a grant for one legal entity passes the route but confers nothing (fail closed).
  if (key === 'ats.costs.manage' || key === 'ats.referral.manage') return ['tenant', 'legal_entity'];
  // Answer 1884: billing.view sits on the Finance templates (typically per legal entity); the plan and invoices are the
  // company's own, read-only, so a legal-entity grant reads the same company-wide plan.
  if (key === 'billing.view') return ['tenant', 'legal_entity'];
  // Engage (batch G2) and Learning's course builder sit on the HR Admin template (typically per legal entity); they act
  // company-wide only, so a legal-entity grant passes the route but confers nothing (the services check tenantWide).
  if (key === 'engage.announce' || key === 'engage.moderate' || key === 'engage.survey.manage' || key === 'learning.manage' || key === 'company.documents.manage') return ['tenant', 'legal_entity'];
  // Visitors slice 1 (answer 613): reception and the log work per location (or entity); visitor settings are company-wide.
  if (key === 'visitors.desk.manage' || key === 'visitors.log.view' || key === 'visitors.rollcall.view') return ['tenant', 'legal_entity', 'location'];
  if (key === 'visitors.settings.manage' || key === 'visitors.watchlist.manage') return ['tenant'];
  // M10 AT1: hiring keys are company-wide until their endpoints become scope-aware (M10-BUILD-DESIGN §17).
  if (key.startsWith('ats.')) return ['tenant'];
  // M02 leave and attendance of people: scoped like employee records. The leave set-up is company configuration: it
  // may be granted per legal entity like org.settings.manage, but changing it needs the company-wide grant.
  if (key === 'leave.settings.manage') return ['tenant', 'legal_entity'];
  // B8/E5 flexible benefits (answer 2456): HR Admin's template is per legal entity, so the key may be granted there to read
  // Settings 4.11; changing the company's flexible components or the unclaimed rule needs the company-wide grant.
  if (key === 'benefits.settings.manage') return ['tenant', 'legal_entity'];
  // Enterprise E1 (answer 2681): HR Admin's template is per legal entity; seat changes are made in the entities the grant
  // covers, and the switch-on plan needs the company-wide grant.
  if (key === 'org.position.manage') return ['tenant', 'legal_entity'];
  // Batch C item 4 (answer 2500): HR oversees pending approvals company-wide or for the people of a legal entity.
  if (key === 'workflow.approvals.oversee') return ['tenant', 'legal_entity'];
  // Batch 2: an attendance month is locked per legal entity; rosters are planned for people, scoped like their records.
  if (key === 'attendance.lock' || key === 'attendance.lock.approve') return ['tenant', 'legal_entity'];
  if (key === 'roster.manage') return GRANT_SCOPE_TYPES;
  if (key.startsWith('leave.') || key.startsWith('attendance.')) return GRANT_SCOPE_TYPES;
  // M01 lifecycle 6a: joiners (by planned place) and person documents are scoped like employee records; checklist
  // templates are company configuration, granted company-wide or per legal entity like org.settings.manage.
  if (key === 'lifecycle.onboarding.view' || key === 'lifecycle.onboarding.manage' || key.startsWith('document.')) return GRANT_SCOPE_TYPES;
  if (key === 'lifecycle.journey.template.manage' || key === 'letter.template.manage' || key === 'letter.signatory.manage') return ['tenant', 'legal_entity'];
  // Batch 6b: background checks and letters are about people, scoped like their records.
  if (key === 'lifecycle.bgv.manage' || key === 'letter.issue') return GRANT_SCOPE_TYPES;
  // Batch 6c: exit cases are about people, scoped like their records; the asset list is kept per entity or location.
  if (key.startsWith('lifecycle.exit.')) return GRANT_SCOPE_TYPES;
  if (key === 'asset.view' || key === 'asset.manage') return ['tenant', 'legal_entity', 'location'];
  // M05 expenses E2: claims are about people, scoped like their records; finance checks them per legal entity.
  if (key === 'expense.claim.view') return GRANT_SCOPE_TYPES;
  // PPL-43 / PPL-44: the compliance officer works for the designated persons of their entities, like employee records.
  if (key === 'compliance.declaration.manage') return GRANT_SCOPE_TYPES;
  // M06 PM2: goals are about people, scoped like their records; periods and company goals are company-wide.
  if (key === 'perf.goal.view') return GRANT_SCOPE_TYPES;
  // PM4: reviews are about people, scoped like their records; cycles are company-wide for now.
  if (key === 'perf.review.view') return GRANT_SCOPE_TYPES;
  // PM6: reports show people in scope; calibration is company-wide like cycles.
  if (key === 'perf.report.view') return GRANT_SCOPE_TYPES;
  // PM7: comp cycles are run and approved per legal entity, like payroll.
  if (key === 'perf.comp.manage' || key === 'perf.comp.approve') return ['tenant', 'legal_entity'];
  // PM8: improvement plans are about people, scoped like their records.
  if (key === 'perf.pip.manage') return GRANT_SCOPE_TYPES;
  // Learning: training reports are about people, scoped like their records; building courses and rules is company-wide.
  if (key === 'learning.report.view') return GRANT_SCOPE_TYPES;
  if (key === 'expense.finance.review') return ['tenant', 'legal_entity'];
  // E4: the travel desk books for people in scope; advances are paid per legal entity.
  if (key === 'travel.booking.manage') return GRANT_SCOPE_TYPES;
  if (key === 'expense.payout.manage' || key === 'expense.report.view') return ['tenant', 'legal_entity'];
  // Founder 3 Nov 2026: HR reads the company's expense policy (company-wide, read only) whatever their HR scope.
  if (key === 'expense.policy.view') return GRANT_SCOPE_TYPES;
  // HLP-10 / HLP-11: company policies are company configuration; granted company-wide or per legal entity like
  // org.settings.manage, but the policy routes need the company-wide grant (PoliciesService.companyWide).
  if (key.startsWith('policy.')) return ['tenant', 'legal_entity'];
  // HLP-08 (answer 34): a disciplinary case is about an employee, so HR opens one only about people in their HR scope.
  if (key === 'case.disciplinary.raise') return GRANT_SCOPE_TYPES;
  // HLP-06: the speak-up case officer lists are company-wide.
  if (key.startsWith('speakup.')) return ['tenant'];
  // M03 batch 5a: payroll and its audit work per legal entity (the pay guard reads the granted entities); legal holds are company-wide.
  // Batch 5e: income tax (workspaces, proofs, regime) works per legal entity like the rest of payroll.
  // Batch 5h: consultants are registered and paid per legal entity like payroll.
  // PAY-58: one's own equity page is about the person, so it rides on any role at any scope.
  if (key === 'payroll.equity.own') return GRANT_SCOPE_TYPES;
  if (key.startsWith('payroll.') || key.startsWith('tax.') || key.startsWith('statutory.') || key.startsWith('consultant.') || key === 'audit.view' || key === 'audit.export') return ['tenant', 'legal_entity'];
  if (key.startsWith('org.') || key.startsWith('pay.range.')) return ['tenant', 'legal_entity'];
  return ['tenant'];
}
