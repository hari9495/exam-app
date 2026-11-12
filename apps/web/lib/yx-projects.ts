'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';

// Projects P-1: reads under ['projects', path]; a write refreshes every projects view.
export function useProjects<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['projects', path], queryFn: () => apiFetch(`/projects${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path !== null), retry: false });
}

export function useProjectsWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> => {
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

/** P-6 (1622): a file from /projects (the cost journal); the API audits it. */
export function useProjectsDownload() {
  const { accessToken } = useAuth();
  return async (path: string, fallback: string) => {
    const { blob, filename } = await apiFetchBlob(`/projects${path}`, {}, accessToken ?? undefined);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename ?? fallback;
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

/** The last n months (YYYY-MM, this month first). */
export function lastMonths(n: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** P-6 (1622): the last n quarters (YYYY-Qn, this quarter first). */
export function lastQuarters(n: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = new Date(from.getFullYear(), from.getMonth() - i * 3, 1);
    out.push(`${m.getFullYear()}-Q${Math.floor(m.getMonth() / 3) + 1}`);
  }
  return out;
}
