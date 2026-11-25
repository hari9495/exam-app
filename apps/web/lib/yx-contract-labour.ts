import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';

// API glue for contract labour (/contract-labour/*: contractors, licences and renewals, Settings 4.9). The API checks
// every call: the keys for the whole company, acting for someone else, and the company.

/** One GET under /contract-labour, cached under ['clra', path]. */
export function useClra<T>(path: string) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['clra', path], queryFn: () => apiFetch(`/contract-labour${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
}

/** A write under /contract-labour (JSON, or a form with the licence copy); refreshes every contract labour view. */
export function useClraWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/contract-labour${path}`, { method, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['clra'] });
    return result as T;
  };
}

/** A licence copy (clean files only; the API audits the open). */
export function useClraDownload() {
  const { accessToken } = useAuth();
  return async (path: string, fallback: string) => {
    const { blob, filename } = await apiFetchBlob(`/contract-labour${path}`, {}, accessToken ?? undefined);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename ?? fallback;
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

/** A licence form: the fields as text and the copy as the file. */
export function licenceForm(fields: Record<string, string | number | string[] | null | undefined>, file: File): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined) f.append(k, Array.isArray(v) ? v.join(',') : String(v));
  f.append('file', file);
  return f;
}
