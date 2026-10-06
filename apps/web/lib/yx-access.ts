import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for Settings › Roles & access (P02 §4.2–4.3, §4.6). The screens in @yukthix/ui/access stay presentational.

/** One GET under the access API, cached under ['yx', 'access', path]. */
export function useAccess<T>(path: string, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['yx', 'access', path], queryFn: () => apiFetch(`/access${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken) && enabled, retry: false });
}

/** A one-off read (not cached), e.g. the effective-access preview of one person. */
export function useAccessRead() {
  const { accessToken } = useAuth();
  return <T>(path: string): Promise<T> => apiFetch(`/access${path}`, {}, accessToken ?? undefined);
}

/** Calls the access API, then refreshes the access lists and the signed-in person's own permissions. */
export function useAccessWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async (path: string, body: unknown) => {
    const result = await apiFetch(`/access${path}`, { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['yx', 'access'] }), queryClient.invalidateQueries({ queryKey: ['yx', 'permissions'] })]);
    return result;
  };
}
