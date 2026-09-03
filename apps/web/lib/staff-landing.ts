// The console each staff role lands in. Mirrors the post-login redirect (see roleToLandingPath in
// lib/staff-routing.ts, used by the v2 login), so login, impersonation (Login as), and
// return-to-admin all send a role to the same place.
export function staffLandingPath(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin':
      return '/v2/organizations';
    case 'org_admin':
      return '/v2/users';
    case 'panel':
      return '/v2/panel/reports';
    default:
      return '/v2/dashboard'; // recruiter
  }
}
