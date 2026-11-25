'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import { saveBlob } from './yx-pay';

// G4: the report library and company documents: reads under ['library', path]; a write refreshes every library read.
export function useLibrary<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['library', path], queryFn: () => apiFetch(`/library${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false });
}

export function useLibraryWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/library${path}`, { method: 'POST', ...(body === undefined ? {} : body instanceof FormData ? { body } : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['library'] });
    return result as T;
  };
}

export function useLibraryDownload() {
  const { accessToken } = useAuth();
  return async (path: string, fallback: string) => {
    const { blob, filename } = await apiFetchBlob(`/library${path}`, {}, accessToken ?? undefined);
    saveBlob(blob, filename ?? fallback);
  };
}
