import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attachment, LoadState, TicketFilters } from '@yukthix/ui/desk';
import { API_BASE, apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';

// API glue for the Service Desk (/desk/*, M14 phase 3b-1). The screens in @yukthix/ui/desk stay presentational; every
// call is checked again on the server (keys, seats, own records).

/** One GET under /desk, cached under ['desk', path]. keepPrevious: show the last answer while a new search or filter loads. */
export function useDesk<T>(path: string | null, { keepPrevious, ...opts }: { refetchInterval?: number; keepPrevious?: boolean } = {}) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['desk', path], queryFn: () => apiFetch(`/desk${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false, ...(keepPrevious ? { placeholderData: keepPreviousData } : {}), ...opts });
}

/** Calls the desk API and refreshes every desk query. */
export function useDeskWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<T> => {
    const result = await apiFetch(`/desk${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['desk'] });
    return result as T;
  };
}

/** Uploads one file to a ticket; it stays "being checked" until the virus scan says it is clean. */
export function useDeskUpload() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async (path: string, file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append('file', file);
    const result = (await apiFetch(`/desk${path}`, { method: 'POST', body: form }, accessToken ?? undefined)) as Attachment;
    await queryClient.invalidateQueries({ queryKey: ['desk'] });
    return result;
  };
}

/** Opens a clean file through its 60-second signed link (§14.2). */
export function useDeskFile() {
  const { accessToken } = useAuth();
  return async (linkPath: string) => {
    const { url } = (await apiFetch(`/desk${linkPath}`, { method: 'POST' }, accessToken ?? undefined)) as { url: string };
    window.open(`${API_BASE}${url}`, '_blank', 'noopener,noreferrer');
  };
}

/** The CSV of a ticket list, as the server builds it (only what the person may see). */
export function useDeskExport() {
  const { accessToken } = useAuth();
  return async (query: string) => {
    const { blob } = await apiFetchBlob(`/desk/tickets/export?${query}`, {}, accessToken ?? undefined);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tickets.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

/** Filters as query parameters (lists joined by commas). */
export function filtersQuery(f: TicketFilters, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(','));
    } else p.set(k, String(v));
  }
  return p.toString();
}

/** The screen state for queries: a plain 403 is a missing key (MFA_REQUIRED is handled by the layout). */
export function deskState(...qs: { isError: boolean; error: unknown; data: unknown }[]): LoadState {
  const err = qs.find((q) => q.isError)?.error as { status?: number; code?: string } | undefined;
  if (err) return err.status === 403 && err.code !== 'MFA_REQUIRED' ? 'no-access' : 'error';
  return qs.every((q) => q.data !== undefined) ? 'ready' : 'loading';
}
