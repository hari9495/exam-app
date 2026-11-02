import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import type { BiasFlag, LiveReviewAssistant } from '@yukthix/ui/performance';

// API glue for performance (M06, /performance/*). The screens in @yukthix/ui/performance stay presentational; the
// API checks every call (perf.setup.manage for set-up).

/** One GET under /performance, cached under ['performance', path]. */
export function usePerf<T>(path: string | null, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['performance', path], queryFn: () => apiFetch(`/performance${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path) && enabled, retry: false });
}

/** A write under /performance; refreshes every performance query. */
export function usePerfWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/performance${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['performance'] });
    return result as T;
  };
}

/** One GET under /performance on demand (a drill-down), not cached. */
export function usePerfRead() {
  const { accessToken } = useAuth();
  return <T,>(path: string): Promise<T> => apiFetch(`/performance${path}`, {}, accessToken ?? undefined) as Promise<T>;
}

/** Saves a file the API streams (a report's CSV). */
export function usePerfDownload() {
  const { accessToken } = useAuth();
  return async (path: string, fallback: string) => {
    const { blob, filename } = await apiFetchBlob(`/performance${path}`, {}, accessToken ?? undefined);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? fallback;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
}

/** The designs take ready, loading or error; anything else (no access, no record) shows as the error with Retry. */
export const perfState = (s: string): 'ready' | 'loading' | 'error' => (s === 'ready' || s === 'loading' ? s : 'error');

/** The designed Performance screens know ready / loading / error; a refusal (403) shows as the error state. */
export function designState(...queries: { isError: boolean; isSuccess: boolean; error: unknown }[]): 'ready' | 'loading' | 'error' {
  if (queries.some((q) => q.isError)) return 'error';
  return queries.every((q) => q.isSuccess) ? 'ready' : 'loading';
}

/** "2026-11-03" → that day at local midnight (the designed screens take dates). */
export function day(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y!, m! - 1, d!);

/** Uploads one file under /performance (multipart "file"); refreshes every performance query. */
export function usePerfUpload() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(path: string, file: File): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    const result = await apiFetch(`/performance${path}`, { method: 'POST', body: form }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['performance'] });
    return result as T;
  };
}

/**
 * PRF-17 the review assistant for the current manager of a review, ready to pass as
 * `<ReviewWorkspaceScreen assistant={{ enabled: true, live }} />` (the PRF-05 page renders it). Null until loaded, and
 * for anyone who is not the review's current manager (the API answers 404).
 */
export function useReviewAssistant(reviewId: string | null): LiveReviewAssistant | null {
  const status = usePerf<{ enabled: boolean; reason: LiveReviewAssistant['reason'] }>(reviewId ? `/reviews/${reviewId}/assistant` : null);
  const write = usePerfWrite();
  if (!reviewId || !status.data) return null;
  const at = `/reviews/${encodeURIComponent(reviewId)}/assistant`;
  return {
    reason: status.data.reason,
    onDraft: () => write<{ draft: string; basis: string }>('POST', `${at}/draft`),
    onCheck: (text, rating) => write<BiasFlag[]>('POST', `${at}/check`, { text, ...(rating == null ? {} : { rating: Math.round(rating) }) }),
    onDecide: async (flag, decision) => void (await write('POST', `${at}/flags`, { flagId: flag.id, kind: flag.kind, decision })),
  };
}

/**
 * PRF-16 the suggested agenda for a 1:1 the signed-in person manages, ready for
 * `<SuggestedAgendaPanel employee={…} items={agenda.items} onAdd={agenda.onAdd} />` (the PRF-11 page renders it).
 */
export function useSuggestedAgenda(oneOnOneId: string | null, enabled = true) {
  const items = usePerf<{ id: string; text: string; why: string }[]>(oneOnOneId ? `/one-on-ones/${oneOnOneId}/suggested-agenda` : null, enabled);
  const write = usePerfWrite();
  return {
    items: items.data ?? [],
    onAdd: async (item: { text: string }) => void (await write('POST', `/one-on-ones/${encodeURIComponent(oneOnOneId!)}/agenda`, { text: item.text })),
  };
}

/** One GET under /performance on demand (a dialog's choices), not cached. */
export function usePerfGet() {
  const { accessToken } = useAuth();
  return <T,>(path: string): Promise<T> => apiFetch(`/performance${path}`, {}, accessToken ?? undefined) as Promise<T>;
}
