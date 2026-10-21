import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for contract workers (/contract-labour) and placements (/staffing), founder decision 21 Oct 2026. Writes
// refresh these lists and the People Directory (its cards count them).

/** One GET under any API path, cached under ['workforce-roles', path]. */
export function useRoles<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['workforce-roles', path], queryFn: () => apiFetch(path!, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false });
}

export function useRolesWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['workforce-roles'] });
    await queryClient.invalidateQueries({ queryKey: ['yx', 'people'] });
    return result as T;
  };
}

/** The list state the live screens take. */
export function rolesState(...qs: { isError: boolean; error: unknown; data: unknown }[]): 'loading' | 'ready' | 'error' | 'no-access' {
  const err = qs.find((q) => q.isError)?.error as { status?: number } | undefined;
  if (err) return err.status === 403 ? 'no-access' : 'error';
  return qs.every((q) => q.data !== undefined) ? 'ready' : 'loading';
}
