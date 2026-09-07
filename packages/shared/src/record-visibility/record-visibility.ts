// Roles whose members are restricted to pipeline entries assigned to them,
// their groups, or unassigned, when an org enables record-level visibility.
// Recruiter only: panel access is scoped by interview assignment, not pipeline
// ownership, so hiding entries would strand panelists on candidates they are
// set to interview. Admins/super-admin are exempt.
export const RECORD_VISIBILITY_GOVERNED_ROLES = ['recruiter'] as const;

export function isRecordVisibilityGoverned(role: string | null | undefined): boolean {
  return role != null && (RECORD_VISIBILITY_GOVERNED_ROLES as readonly string[]).includes(role);
}
