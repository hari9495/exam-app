import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for performance (M06, /performance/*). The screens in @yukthix/ui/performance stay presentational; the
// API checks every call (perf.setup.manage for set-up).

/** One GET under /performance, cached under ['performance', path]. */
export function usePerf<T>(path: string | null, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['performance', path], queryFn: () => apiFetch(`/performance${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path) && enabled, retry: false });
}

/** A write under /performance; refreshes every performance query. */
export function usePerfWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/performance${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['performance'] });
    return result as T;
  };
}
