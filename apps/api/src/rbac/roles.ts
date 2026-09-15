// Staff roles whose permission set an org admin may edit in the Roles & Permissions matrix.
// super_admin (platform) and org_admin (full org superuser) are deliberately NOT editable: keeping
// org_admin fixed prevents an admin from removing their own management access and locking the org
// out, and super_admin is the platform role. No row in org_role_permissions for a role = the global
// seed default (ROLE_PERMISSIONS) applies.
export const EDITABLE_ROLES = ['hiring_manager', 'recruiter', 'panel'] as const;
export type EditableRole = (typeof EDITABLE_ROLES)[number];

export function isEditableRole(role: string): role is EditableRole {
  return (EDITABLE_ROLES as readonly string[]).includes(role);
}

// Roles an org admin may assign to a staff user (create/edit user). Includes org_admin, the three
// editable roles, and the fixed read-only auditor; excludes super_admin (platform-only). auditor is
// intentionally absent from EDITABLE_ROLES so its read-only grant set can't be edited to add writes.
export const CREATABLE_ROLES = ['org_admin', 'hiring_manager', 'recruiter', 'panel', 'auditor'] as const;
