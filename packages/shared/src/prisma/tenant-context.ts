export interface TenantContext {
  organizationId: string | null;
  isSuperAdmin: boolean;
  userId?: string | null;
  role?: string | null;
}
