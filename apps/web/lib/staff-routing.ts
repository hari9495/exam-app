// Mirrors the role→landing redirect the current login performs. Pure so it is unit-tested.
export function roleToLandingPath(role: string | undefined): string {
  switch (role) {
    case 'super_admin':
      return '/v2/organizations';
    case 'org_admin':
      return '/v2/users';
    case 'panel':
      return '/v2/panel/reports';
    default:
      return '/v2/dashboard';
  }
}
