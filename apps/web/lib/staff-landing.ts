import { roleToLandingPath } from './staff-routing';

// The console each staff role lands in: the same place as the post-login redirect (roleToLandingPath), so login,
// impersonation (Login as) and return-to-admin all send a role to the same place.
export function staffLandingPath(role: string | null | undefined): string {
  return roleToLandingPath(role ?? undefined);
}
