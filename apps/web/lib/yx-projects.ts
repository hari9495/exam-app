'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// Projects P-1: reads under ['projects', path]; a write refreshes every projects view.
export function useProjects<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['projects', path], queryFn: () => apiFetch(`/projects${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path !== null), retry: false });
}

export function useProjectsWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/projects${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    return result as T;
  };
}

/** One read under /projects, now (a request's matches). */
export function useProjectsGet() {
  const { accessToken } = useAuth();
  return <T,>(path: string): Promise<T> => apiFetch(`/projects${path}`, {}, accessToken ?? undefined) as Promise<T>;
}
