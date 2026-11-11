'use client';

import { useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AccessRequestContext, NotFoundReferenceContext, useToast, type AccessRequestSent } from '@yukthix/ui';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { useNotFoundReference } from './yx-not-found';

type Mine = { allowed: boolean; maxDays: number; sent: { askedAt: string; state: 'waiting' | 'approval' | 'open' | 'refused' | 'ended'; validTo: string | null; decisionNote: string | null } | null };

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Answer 946: what a "You don't have access" page needs, loaded only when one shows. */
function usePageRequests(pathname: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ['yx', 'access-requests', 'mine', pathname];
  const mine = useQuery<Mine>({ queryKey: key, queryFn: () => apiFetch(`/access/requests/mine?page=${encodeURIComponent(pathname)}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  const m = mine.data;
  if (!m?.allowed) return null;
  const sent: AccessRequestSent | null = m.sent ? { askedAt: m.sent.askedAt, state: m.sent.state === 'approval' ? 'waiting' : m.sent.state, until: m.sent.validTo ? day(m.sent.validTo) : null, note: m.sent.decisionNote } : null;
  return {
    maxDays: m.maxDays,
    sent,
    send: async (input: { what: string; reason: string; days: number }) => {
      await apiFetch('/access/requests', { method: 'POST', body: JSON.stringify({ page: pathname, ...input }) }, accessToken ?? undefined);
      await qc.invalidateQueries({ queryKey: key });
      toast({ tone: 'success', title: 'Request sent', description: 'A System Admin decides it. You get a notification either way.' });
    },
  };
}

// One hook per page, so the kit calls the same hook for as long as the page shows.
const requestsHook = (pathname: string) =>
  function useRequests() {
    return usePageRequests(pathname);
  };

/**
 * Answers 946 and 947 for every page of the app frame: "You don't have access" offers Request access (when the company
 * allows it; never in a support session or while acting for someone), and "Not found" shows the reference of its 404.
 */
export function YxPageHelp({ pathname, requests, children }: { pathname: string; requests: boolean; children: ReactNode }) {
  const reference = useNotFoundReference(pathname);
  const useRequests = useMemo(() => requestsHook(pathname), [pathname]);
  return (
    <NotFoundReferenceContext.Provider value={reference}>
      <AccessRequestContext.Provider value={requests && pathname.startsWith('/') ? useRequests : null}>{children}</AccessRequestContext.Provider>
    </NotFoundReferenceContext.Provider>
  );
}
