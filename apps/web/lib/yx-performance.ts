import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
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
  return async <T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/performance${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['performance'] });
    return result as T;
  };
}

/** One GET under /performance on demand (a drill-down), not cached. */
export function usePerfRead() {
  const { accessToken } = useAuth();
  return <T,>(path: string): Promise<T> => apiFetch(`/performance${path}`, {}, accessToken ?? undefined) as Promise<T>;
}

/** Saves a file the API streams (a report's CSV). */
export function usePerfDownload() {
  const { accessToken } = useAuth();
  return async (path: string, fallback: string) => {
    const { blob, filename } = await apiFetchBlob(`/performance${path}`, {}, accessToken ?? undefined);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? fallback;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
}

/** The designs take ready, loading or error; anything else (no access, no record) shows as the error with Retry. */
export const perfState = (s: string): 'ready' | 'loading' | 'error' => (s === 'ready' || s === 'loading' ? s : 'error');

/** The designed Performance screens know ready / loading / error; a refusal (403) shows as the error state. */
export function designState(...queries: { isError: boolean; isSuccess: boolean; error: unknown }[]): 'ready' | 'loading' | 'error' {
  if (queries.some((q) => q.isError)) return 'error';
  return queries.every((q) => q.isSuccess) ? 'ready' : 'loading';
}

/** "2026-11-03" → that day at local midnight (the designed screens take dates). */
export function day(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}
