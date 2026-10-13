import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for YukthiX hiring (M10, /hiring/*). The screens in @yukthix/ui/hiring stay presentational; the API checks
// every call. Jobs, pipelines and approval chains keep their existing hooks (lib/hooks), one backend (founder D1).

/** One GET under /hiring, cached under ['hiring', path]. */
export function useHiring<T>(path: string | null, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['hiring', path], queryFn: () => apiFetch(`/hiring${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path) && enabled, retry: false });
}

/** A write under /hiring; refreshes hiring queries and the jobs list. */
export function useHiringWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/hiring${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['hiring'] }), queryClient.invalidateQueries({ queryKey: ['jobs'] })]);
    return result as T;
  };
}

/** M10 AT5: one GET anywhere on the API (the job workspace reads the older hiring endpoints too), cached under ['api', path]. */
export function useApi<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['api', path], queryFn: () => apiFetch(path!, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false });
}

/** A write anywhere on the API; refreshes every hiring view (board, application, jobs, candidates). */
export function useApiWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await Promise.all(['api', 'hiring', 'jobs', 'candidates'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
    return result as T;
  };
}
