'use client';

import { useQuery } from '@tanstack/react-query';
import { AskYukthix, type AskState } from '@yukthix/ui/desk';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

/**
 * Ask YukthiX (answers 2101 to 2108) for the Help drawer's tab. People outside a customer company (YukthiX staff) and
 * anyone acting for someone else get a 403 from the API: the tab is then left out (null).
 */
export function useAskYukthix(open: boolean) {
  const { accessToken } = useAuth();
  const q = useQuery<AskState>({ queryKey: ['help', 'assistant'], queryFn: () => apiFetch('/help/assistant', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && open, retry: false });
  const status = (q.error as { status?: number } | null)?.status;
  if (status === 403) return null;
  const call = <T,>(path: string, method: 'POST' | 'PUT', body?: unknown) => apiFetch(`/help/assistant${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined) as Promise<T>;
  return (
    <AskYukthix
      state={q.data ?? null}
      loadError={q.isError ? 'Try again in a moment.' : null}
      contactHref="/yx/support"
      onAsk={(question, conversationId) => call('/ask', 'POST', { question, ...(conversationId ? { conversationId } : {}) })}
      onFeedback={(id, value) => call(`/answers/${encodeURIComponent(id)}/feedback`, 'PUT', { value })}
      onRaiseTicket={(id) => call(`/conversations/${encodeURIComponent(id)}/ticket`, 'POST')}
      onFeatureRequest={(id, title, details) => call(`/conversations/${encodeURIComponent(id)}/feature-request`, 'POST', { title, ...(details ? { details } : {}) })}
      // Answer 2112: a buying question goes to YukthiX sales (Plan & add-ons' key, checked again on the server).
      onSalesRequest={(id, input) => call(`/conversations/${encodeURIComponent(id)}/sales-request`, 'POST', input)}
    />
  );
}
