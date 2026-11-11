'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LiveWhatsNew } from '@yukthix/ui/desk';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

interface WhatsNewData {
  show: boolean;
  unread: number;
  entries: LiveWhatsNew['entries'];
}

/**
 * Help H-4 (answer 943): the signed-in person's What's new for the one Help drawer (H-1 shows it as the What's new tab).
 * `null` while the company has "Show what's new" off. `unread` is there for a count on the tab.
 */
export function useWhatsNew(enabled: boolean): LiveWhatsNew | null {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery<WhatsNewData>({ queryKey: ['help', 'whats-new'], queryFn: () => apiFetch('/help/whats-new', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && enabled, retry: false });
  if (q.data && !q.data.show) return null;
  return {
    state: q.isError ? 'error' : q.data ? 'ready' : 'loading',
    onRetry: () => void q.refetch(),
    entries: q.data?.entries ?? [],
    unread: q.data?.unread ?? 0,
    onMarkAllRead: async () => {
      const next = (await apiFetch('/help/whats-new/read', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined)) as WhatsNewData;
      queryClient.setQueryData(['help', 'whats-new'], next);
    },
  };
}
