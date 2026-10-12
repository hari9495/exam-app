import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for Payroll batch 5j beyond lib/yx-pay.ts: the statutory (/statutory) and tax (/tax) APIs, uploads, and people's
// names for the payroll tables (the HR list, which already applies the viewer's scope).

/** One GET under any API path, cached under ['payroll', path] so payroll writes refresh it too. */
export function useApi<T>(path: string | null) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['payroll', path], queryFn: () => apiFetch(path!, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path), retry: false });
}

/** A write under any API path (POST unless told otherwise); a FormData body is sent as a file upload. Refreshes payroll. */
export function useApiWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(path: string, body?: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): Promise<T> => {
    const result = await apiFetch(path, { method, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['payroll'] });
    await queryClient.invalidateQueries({ queryKey: ['workflow'] });
    return result as T;
  };
}

/** Names of the people in the viewer's scope, for showing a person in payroll tables. */
export function useNames() {
  const people = useApi<{ id: string; name: string; employeeCode: string | null }[]>('/people/employees');
  const map = new Map((people.data ?? []).map((p) => [p.id, p.name]));
  return (id: string) => map.get(id) ?? 'Someone';
}
