'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// Engage (batch G2, M09): reads under ['engage', path]; a write refreshes every Engage view.
export function useEngage<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['engage', path], queryFn: () => apiFetch(`/engage${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path !== null), retry: false });
}

export function useEngageWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/engage${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['engage'] });
    return result as T;
  };
}

/** The screens' load state: 403 is no access, any other failure an error. */
export function engageState(...qs: { isError: boolean; error: unknown; data: unknown }[]): 'ready' | 'loading' | 'error' | 'no-access' {
  const err = qs.find((q) => q.isError)?.error as { status?: number } | undefined;
  if (err) return err.status === 403 ? 'no-access' : 'error';
  return qs.some((q) => q.data === undefined) ? 'loading' : 'ready';
}
