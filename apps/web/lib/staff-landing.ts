// The console each staff role lands in. Mirrors the post-login redirect in app/login/page.tsx,
// so login, impersonation (Login as), and return-to-admin all send a role to the same place.
export function staffLandingPath(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin':
      return '/organizations';
    case 'org_admin':
      return '/users';
    case 'panel':
      return '/reports';
    default:
      return '/dashboard'; // recruiter
  }
}
