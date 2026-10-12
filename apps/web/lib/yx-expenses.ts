import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PolicySave } from '@yukthix/ui/expenses';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

// API glue for expenses (M05, /expenses/*). The screens in @yukthix/ui/expenses stay presentational; the API checks
// every call (expense.policy.manage for set-up, the person for their own limits).

/** One GET under /expenses, cached under ['expenses', path]. */
export function useExp<T>(path: string | null, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey: ['expenses', path], queryFn: () => apiFetch(`/expenses${path}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken && path) && enabled, retry: false });
}

/** A write under /expenses; refreshes every expenses query. */
export function useExpWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/expenses${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['expenses'] });
    return result as T;
  };
}

/** A policy save as the API wants it: in place, a new version from a date, or a new policy. */
export function policyRequest(s: PolicySave): { method: 'POST' | 'PUT'; path: string; body: unknown } {
  const p = s.policy;
  const body = { name: p.name, appliesIf: p.appliesIf, priority: p.priority, validFrom: p.validFrom, validTo: p.validTo, status: p.status, rules: p.rules };
  if (s.mode === 'create') return { method: 'POST', path: '/policies', body };
  if (s.mode === 'version') return { method: 'POST', path: `/policies/${encodeURIComponent(s.policy.id)}/new-version`, body: { ...body, validFrom: s.from, version: s.policy.version } };
  return { method: 'PUT', path: `/policies/${encodeURIComponent(s.policy.id)}`, body: { ...body, version: s.policy.version } };
}
