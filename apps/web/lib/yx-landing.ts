import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { roleToLandingPath } from './staff-routing';

// Which part of the product a person belongs in, from the permissions they hold (GET
// /rbac/me/permissions), not their legacy role: an HR permission profile rides on role 'panel' but
// holds no exam/ATS keys, so the old /v2 exam and ATS screens would only answer 403.

/** Any of these opens some of the exam / ATS (/v2) screens. */
export const EXAM_ATS_KEYS = ['exam:manage', 'results:view', 'candidate:manage', 'candidate:view', 'pipeline:manage', 'question_bank:manage', 'interview:view_assigned'] as const;
const DIRECTORY_KEY = 'employee.profile.view';
const LANDING_KEYS = [...EXAM_ATS_KEYS, DIRECTORY_KEY];

/** Pure: where a signed-in person lands. Exam/ATS people (and platform staff) keep their role's console. */
export function landingFor(role: string | undefined, granted: readonly string[]): string {
  if (role === 'super_admin' || EXAM_ATS_KEYS.some((k) => granted.includes(k))) return roleToLandingPath(role);
  return granted.includes(DIRECTORY_KEY) ? '/yx/people/directory' : '/yx/me/security';
}

const grantedKeys = (token: string | undefined): Promise<string[]> => apiFetch(`/rbac/me/permissions?keys=${LANDING_KEYS.join(',')}`, {}, token);

/** Landing after a YukthiX sign-in. If the permissions cannot be read, the safe default is My security. */
export async function yxLandingPath(accessToken: string, role: string | undefined): Promise<string> {
  try {
    return landingFor(role, await grantedKeys(accessToken));
  } catch {
    return '/yx/me/security';
  }
}

/** The exam/ATS keys the signed-in person holds; `ready` once known. */
export function useLanding() {
  const { accessToken, role } = useAuth();
  const q = useQuery<string[]>({
    queryKey: ['landing-permissions'],
    queryFn: () => grantedKeys(accessToken ?? undefined),
    enabled: Boolean(accessToken),
    staleTime: 60_000,
    retry: false,
  });
  const granted = q.data ?? [];
  return {
    ready: q.isSuccess || q.isError,
    has: (key: string) => granted.includes(key),
    examAts: role === 'super_admin' || EXAM_ATS_KEYS.some((k) => granted.includes(k)),
    landing: landingFor(role ?? undefined, granted),
  };
}
