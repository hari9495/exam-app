export interface TenantContext {
  organizationId: string | null;
  isSuperAdmin: boolean;
  userId?: string | null;
  role?: string | null;
  permissionProfileId?: string | null;
  /** YukthiX staff inside an approved support session (P02 Q8): RLS keeps pay, identity and bank data out of reach. */
  supportSessionId?: string | null;
}
