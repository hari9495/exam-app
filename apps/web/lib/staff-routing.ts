// Mirrors the role→landing redirect the current login performs. Pure so it is unit-tested.
export function roleToLandingPath(role: string | undefined): string {
  switch (role) {
    case 'super_admin':
      return '/organizations';
    case 'org_admin':
      return '/users';
    case 'panel':
      return '/reports';
    default:
      return '/dashboard';
  }
}
