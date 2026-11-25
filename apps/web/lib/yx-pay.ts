import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoadState } from '@yukthix/ui/pay';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';

// API glue for Payroll batch 5a (/payroll/*). The screens in @yukthix/ui/pay stay presentational; every call is checked
// again on the server (the key's legal entities, maker ≠ checker, step-up, the database pay guard).

/** One GET under /payroll, cached under ['payroll', path]. */
export function usePay<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['payroll', path], queryFn: () => apiFetch(`/payroll${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false });
}

/** Several GETs under /payroll at once (same cache keys as usePay); the results by path, only those loaded. */
export function usePays<T>(paths: string[]): Record<string, T> {
  const { accessToken } = useAuth();
  const qs = useQueries({ queries: paths.map((path) => ({ queryKey: ['payroll', path], queryFn: (): Promise<T> => apiFetch(`/payroll${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false })) });
  return Object.fromEntries(paths.flatMap((p, i) => (qs[i].data === undefined ? [] : [[p, qs[i].data as T]])));
}

/** Calls the payroll API (POST unless told otherwise) and refreshes every payroll query (and the approvals inbox). */
export function usePayWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(path: string, body?: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): Promise<T> => {
    const result = await apiFetch(`/payroll${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['payroll'] });
    await queryClient.invalidateQueries({ queryKey: ['workflow'] });
    return result as T;
  };
}

/** A GET that is not cached (histories, timelines). */
export function usePayRead() {
  const { accessToken } = useAuth();
  return <T,>(path: string) => apiFetch(`/payroll${path}`, {}, accessToken ?? undefined) as Promise<T>;
}

/** Downloads a payroll file with the person's token, as the browser's own download. */
export function usePayDownload() {
  const { accessToken } = useAuth();
  return async (path: string, fallbackName: string) => {
    const { blob, filename } = await apiFetchBlob(path, {}, accessToken ?? undefined);
    saveBlob(blob, filename ?? fallbackName);
  };
}

/** A file as a Blob for the kit's in-page viewers (PAY-21 payslip PDF, PAY-23 proof files); the same signed-in call as a download. */
export function usePayBlob() {
  const { accessToken } = useAuth();
  return async (path: string) => (await apiFetchBlob(path, {}, accessToken ?? undefined)).blob;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function payState(...qs: { isError: boolean; error: unknown; data: unknown }[]): LoadState {
  const err = qs.find((q) => q.isError)?.error as { status?: number; code?: string } | undefined;
  if (err) return err.status === 403 && err.code !== 'MFA_REQUIRED' ? 'no-access' : 'error';
  return qs.every((q) => q.data !== undefined) ? 'ready' : 'loading';
}

/** Where a document's verify code is checked (the public page). */
export const verifyUrl = (code: string) => `/yx/verify/${encodeURIComponent(code)}`;
