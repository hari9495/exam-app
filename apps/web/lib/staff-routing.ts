// Where each role lands after sign-in (decision 2398: the old /v2 console retires). Platform staff open their console;
// everyone else, recruiters, interviewers, auditors and company admins included, lands on the YukthiX Home.
// Pure so it is unit-tested.
export function roleToLandingPath(role: string | undefined): string {
  return role === 'super_admin' ? '/staff/companies' : '/yx/home';
}
