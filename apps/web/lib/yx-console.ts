import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoadState } from '@yukthix/ui/console';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for the YukthiX platform console (/platform/*, staff only). The screens in @yukthix/ui/console stay
// presentational.

/** One GET under /platform, cached under ['console', path]. */
export function useConsole<T>(path: string, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['console', path], queryFn: () => apiFetch(`/platform${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken) && enabled, retry: false });
}

/** Calls the console API and refreshes every console list. */
export function useConsoleWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> => {
    const result = await apiFetch(`/platform${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['console'] });
    return result as T;
  };
}

/** The screen state for a query: a plain 403 is a missing key; MFA_REQUIRED is handled by the console layout. */
export function loadState(q: { isError: boolean; error: unknown; data: unknown }): LoadState {
  const err = q.error as { status?: number; code?: string } | null;
  if (q.isError && err?.status === 403 && err.code !== 'MFA_REQUIRED') return 'no-access';
  if (q.isError) return 'error';
  return q.data === undefined ? 'loading' : 'ready';
}

/** Today in India (YYYY-MM-DD): prices start on Indian dates. */
export const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const CONSOLE_KEYS = ['platform.companies.view', 'platform.companies.manage', 'platform.plans.manage', 'platform.channels.manage', 'platform.support.request', 'platform.audit.view'] as const;
export type ConsoleKey = (typeof CONSOLE_KEYS)[number];

/** Which console keys the staff member holds (for buttons only; the API checks every call). */
export function useConsoleKeys() {
  const { accessToken } = useAuth();
  const q = useQuery<ConsoleKey[]>({
    queryKey: ['console', 'keys'],
    queryFn: () => apiFetch(`/rbac/me/permissions?keys=${CONSOLE_KEYS.join(',')}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  });
  return (key: ConsoleKey) => Boolean(q.data?.includes(key));
}
