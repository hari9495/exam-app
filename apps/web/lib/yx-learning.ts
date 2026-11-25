'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import { saveBlob } from './yx-pay';

// Learning (the core): reads under /learning, writes that refresh every Learning read, and files (certificates,
// the audit export, a course's PDFs and videos).

export function useLearning<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['learning', path], queryFn: () => apiFetch(`/learning${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false });
}

export function useLearningWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/learning${path}`, { method, ...(body === undefined ? {} : body instanceof FormData ? { body } : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['learning'] });
    return result as T;
  };
}

export function useLearningFiles() {
  const { accessToken } = useAuth();
  const fetchBlob = (path: string) => apiFetchBlob(`/learning${path}`, {}, accessToken ?? undefined);
  return {
    /** Saves the file under its own name. */
    download: async (path: string, fallback: string) => {
      const { blob, filename } = await fetchBlob(path);
      saveBlob(blob, filename ?? fallback);
    },
    /** Opens a course file (PDF or video) in a new tab; the API serves it sandboxed. */
    open: async (path: string) => {
      const tab = window.open('', '_blank');
      const { blob } = await fetchBlob(path);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };
}
