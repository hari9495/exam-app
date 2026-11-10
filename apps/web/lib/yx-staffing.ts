import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';

// API glue for the staffing desk (/staffing/*: clients, contacts, rate cards, Settings 6.2; slice 2: client jobs,
// submissions, placements, bench, vendors). The API checks
// every call: the desk switch, the keys, acting for someone else, and the company.

/** One GET under /staffing, cached under ['staffing', path]. */
export function useStaffing<T>(path: string | null, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['staffing', path], queryFn: () => apiFetch(`/staffing${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path) && enabled, retry: false });
}

/** A one-off GET under /staffing (a sheet's choices once a job or client is picked). */
export function useStaffingGet() {
  const { accessToken } = useAuth();
  return useCallback(<T>(path: string): Promise<T> => apiFetch(`/staffing${path}`, {}, accessToken ?? undefined) as Promise<T>, [accessToken]);
}

/** Downloads a file under /staffing (the invoice PDF, answer 492). */
export function useStaffingDownload() {
  const { accessToken } = useAuth();
  return useCallback(async (path: string, name: string) => {
    const { blob, filename } = await apiFetchBlob(`/staffing${path}`, {}, accessToken ?? undefined);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? name;
    a.click();
    URL.revokeObjectURL(url);
  }, [accessToken]);
}

/** A write under /staffing; refreshes every staffing view. */
export function useStaffingWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/staffing${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['staffing'] });
    return result as T;
  };
}

/** Rupees (a number from a currency field) as the exact text the API takes: two decimals, never a float on the wire. */
export const rupees = (n: number) => n.toFixed(2);

/** The page's state from a query: the desk off is the API's 403 with that message. */
export function deskState(q: { isError: boolean; isSuccess: boolean; error: unknown }): 'ready' | 'loading' | 'error' | 'denied' | 'off' {
  if (q.isError) {
    const e = q.error as { status?: number; message?: string };
    return e.status === 403 ? (/staffing desk is off/.test(e.message ?? '') ? 'off' : 'denied') : 'error';
  }
  return q.isSuccess ? 'ready' : 'loading';
}
