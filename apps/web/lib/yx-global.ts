import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for batch G1 (country packs, the "Add a country" guide, translations, my language). The screens in
// @yukthix/ui/global stay presentational.

/** One GET under the global API, cached under ['yx', 'global', path]. */
export function useGlobal<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['yx', 'global', path], queryFn: () => apiFetch(`/global${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken) && path !== null, retry: false });
}

/** Calls the global API and refreshes the global queries (and the people / leave views that show translated words). */
export function useGlobalWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/global${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await Promise.all([['yx', 'global'], ['yx', 'people'], ['time']].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    return result as T;
  };
}
