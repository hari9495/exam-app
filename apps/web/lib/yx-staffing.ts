import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for the staffing desk (/staffing/*, slice 1: clients, contacts, rate cards, Settings 6.2). The API checks
// every call: the desk switch, the keys, acting for someone else, and the company.

/** One GET under /staffing, cached under ['staffing', path]. */
export function useStaffing<T>(path: string | null, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['staffing', path], queryFn: () => apiFetch(`/staffing${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path) && enabled, retry: false });
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
