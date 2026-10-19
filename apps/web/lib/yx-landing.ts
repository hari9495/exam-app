import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { roleToLandingPath } from './staff-routing';

// Which part of the product a person belongs in, from the permissions they hold (GET
// /rbac/me/permissions), not their legacy role: an HR permission profile rides on role 'panel' but
// holds no exam/ATS keys, so the old /v2 exam and ATS screens would only answer 403.

/** Any of these opens some of the exam / ATS (/v2) screens. */
export const EXAM_ATS_KEYS = ['exam:manage', 'results:view', 'candidate:manage', 'candidate:view', 'pipeline:manage', 'question_bank:manage', 'interview:view_assigned'] as const;
export const YX_HOME = '/yx/home';

/**
 * Pure: where a signed-in person lands. Everyone lands on the YukthiX Home (design audit step 1, PLT-02), recruiters and
 * interviewers too (founder, 19 Oct 2026: hiring is in YukthiX; the older exam tools are one link in Hire). Only
 * platform staff keep their console. A new hire in their first 30 days lands on that page (lifecycle 6f, design §7.6).
 */
export function landingFor(role: string | undefined, firstDays = false): string {
  if (role === 'super_admin') return roleToLandingPath(role);
  return firstDays ? '/yx/me/first-30-days' : YX_HOME;
}

const grantedKeys = (token: string | undefined): Promise<string[]> => apiFetch(`/rbac/me/permissions?keys=${EXAM_ATS_KEYS.join(',')}`, {}, token);

/** Landing after a YukthiX sign-in. A new hire's first 30 days (lifecycle 6f); any failure just means Home. */
export async function yxLandingPath(accessToken: string, role: string | undefined): Promise<string> {
  const firstDays = await apiFetch('/lifecycle/me/first-30-days', {}, accessToken).then((r: { card?: unknown } | null | undefined) => Boolean(r?.card), () => false);
  return landingFor(role, firstDays);
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
    landing: landingFor(role ?? undefined),
  };
}
