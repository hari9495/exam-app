'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';

// Learning (batch G3, M07): reads under ['learning', path]; a write refreshes every Learning view.
export function useLearning<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['learning', path], queryFn: () => apiFetch(`/learning${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path !== null), retry: false });
}

export function useLearningWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT', path: string, body?: unknown | FormData): Promise<T> => {
    const result = await apiFetch(`/learning${path}`, { method, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['learning'] });
    return result as T;
  };
}

/** Opens a file the API streams (a course's video or PDF) in a new tab. */
export function useLearningOpen() {
  const { accessToken } = useAuth();
  return async (path: string) => {
    const { blob } = await apiFetchBlob(`/learning${path}`, {}, accessToken ?? undefined);
    window.open(URL.createObjectURL(blob), '_blank', 'noopener');
  };
}

/** 403 is no access, any other failure an error. */
export function learningState(...qs: { isError: boolean; error: unknown; data: unknown }[]): 'ready' | 'loading' | 'error' | 'no-access' {
  const err = qs.find((q) => q.isError)?.error as { status?: number } | undefined;
  if (err) return err.status === 403 ? 'no-access' : 'error';
  return qs.some((q) => q.data === undefined) ? 'loading' : 'ready';
}
