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
 * location, a department subtree, or the grantee's own reports (relative to their employee record).
 * The implicit grants (YX-SEC-04: self, manager, dotted line, department head) are computed, never stored.
 */
export const GRANT_SCOPE_TYPES = ['tenant', 'legal_entity', 'location', 'department_subtree', 'all_reports', 'direct_reports'] as const;
export type GrantScopeType = (typeof GRANT_SCOPE_TYPES)[number];

export interface GrantScope {
  type: GrantScopeType;
  /** The entity, location or department; null for tenant and the report scopes. */
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
  // M02 leave and attendance of people: scoped like employee records. The leave set-up is company configuration: it
  // may be granted per legal entity like org.settings.manage, but changing it needs the company-wide grant.
  if (key === 'leave.settings.manage') return ['tenant', 'legal_entity'];
  // Batch 2: an attendance month is locked per legal entity; rosters are planned for people, scoped like their records.
  if (key === 'attendance.lock') return ['tenant', 'legal_entity'];
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
  // M03 batch 5a: payroll and its audit work per legal entity (the pay guard reads the granted entities); legal holds are company-wide.
  if (key.startsWith('payroll.') || key === 'audit.view' || key === 'audit.export') return ['tenant', 'legal_entity'];
  if (key.startsWith('org.') || key.startsWith('pay.range.')) return ['tenant', 'legal_entity'];
  return ['tenant'];
}
