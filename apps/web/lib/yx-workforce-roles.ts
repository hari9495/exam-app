import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import { saveBlob } from './yx-pay';

// API glue for contract workers (/contract-labour) and placements (/staffing), founder decision 21 Oct 2026. Writes
// refresh these lists and the People Directory (its cards count them).

/** One GET under any API path, cached under ['workforce-roles', path]. */
export function useRoles<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['workforce-roles', path], queryFn: () => apiFetch(path!, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false });
}

/** A write (POST unless told otherwise); a FormData body is sent as a file upload. */
export function useRolesWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(path: string, body?: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> => {
    const result = await apiFetch(path, { method, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['workforce-roles'] });
    await queryClient.invalidateQueries({ queryKey: ['yx', 'people'] });
    return result as T;
  };
}

/** A one-off read that is not cached (a proof's checks, a contractor's documents, a revealed number). */
export function useRolesRead() {
  const { accessToken } = useAuth();
  return <T>(path: string, init: RequestInit = {}): Promise<T> => apiFetch(path, init, accessToken ?? undefined);
}

/** A GET that answers with a file, saved as a download. */
export function useRolesDownload() {
  const { accessToken } = useAuth();
  return async (path: string, name: string) => {
    const { blob, filename } = await apiFetchBlob(path, {}, accessToken ?? undefined);
    saveBlob(blob, filename ?? name);
  };
}

/** Fields (and an optional file) as a multipart body; empty values are left out. */
export function formOf(fields: Record<string, string | number | boolean | undefined | null>, file?: File): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== '') f.append(k, String(v));
  if (file) f.append('file', file);
  return f;
}

/** The last six months up to this one, newest last ("2026-10"). */
export function recentMonths(today: string, n = 6): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - n + i, 1)).toISOString().slice(0, 7));
}

/** The list state the live screens take. */
export function rolesState(...qs: { isError: boolean; error: unknown; data: unknown }[]): 'loading' | 'ready' | 'error' | 'no-access' {
  const err = qs.find((q) => q.isError)?.error as { status?: number } | undefined;
  if (err) return err.status === 403 ? 'no-access' : 'error';
  return qs.every((q) => q.data !== undefined) ? 'ready' : 'loading';
}
