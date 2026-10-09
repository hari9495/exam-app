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
/** Any of these is YukthiX HR work: the person lands in YukthiX, not the exam console. */
const YX_SETTINGS_KEYS = ['org.settings.manage', 'org.structure.view', 'access.role.manage'] as const;
/** A Service Desk agent lands on their ticket queue (M14). */
const DESK_KEY = 'desk.ticket.view';
const LANDING_KEYS = [...EXAM_ATS_KEYS, DIRECTORY_KEY, DESK_KEY, ...YX_SETTINGS_KEYS];

/**
 * Pure: where a signed-in person lands. Anyone with an employee record or any YukthiX HR permission lands in
 * YukthiX (Directory if they may read it, else their own Profile); exam / hiring stays one click away
 * ("Hiring and assessments"). Only exam/ATS accounts with no employee record (and platform staff)
 * keep their role's console.
 */
export function landingFor(role: string | undefined, granted: readonly string[], isEmployee = false): string {
  if (role === 'super_admin') return roleToLandingPath(role);
  if (granted.includes(DIRECTORY_KEY)) return '/yx/people/directory';
  if (granted.includes(DESK_KEY)) return '/yx/desk/tickets';
  if (isEmployee) return '/yx/people/profile';
  if (YX_SETTINGS_KEYS.some((k) => granted.includes(k))) return '/yx/settings/legal-entities';
  if (EXAM_ATS_KEYS.some((k) => granted.includes(k))) return roleToLandingPath(role);
  return '/yx/me/security';
}

const grantedKeys = (token: string | undefined): Promise<string[]> => apiFetch(`/rbac/me/permissions?keys=${LANDING_KEYS.join(',')}`, {}, token);

/** Landing after a YukthiX sign-in. If the permissions cannot be read, the safe default is My security. */
export async function yxLandingPath(accessToken: string, role: string | undefined): Promise<string> {
  try {
    const [granted, isEmployee] = await Promise.all([
      grantedKeys(accessToken),
      apiFetch('/people/me', {}, accessToken).then(() => true, () => false),
    ]);
    return landingFor(role, granted, isEmployee);
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
