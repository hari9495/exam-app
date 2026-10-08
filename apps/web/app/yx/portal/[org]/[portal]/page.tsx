'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@yukthix/ui';
import { PortalScreen, type KbArticleView, type KbSuggestion, type LoadState, type PortalHome, type PortalMe, type PortalTicket, type PortalTicketRow } from '@yukthix/ui/desk';
import { botChallengeToken } from '../../../../../lib/bot-challenge';
import { portalFetch, portalSession, type PortalError } from '../../../../../lib/yx-portal';

// The outside help page (§9.3, US-G-021), outside the staff app: customers sign in with a 6-digit email code and
// follow their tickets. ?ticket=<id> opens that ticket once signed in; ?opened=<number> says a new ticket is open.
function PortalPage() {
  const { org, portal } = useParams<{ org: string; portal: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [token, setTokenState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setTokenState(portalSession.get(org, portal));
    setLoaded(true);
  }, [org, portal]);
  const setToken = (t: string | null) => {
    portalSession.set(org, portal, t);
    setTokenState(t);
  };
  const base = `/yx/portal/${encodeURIComponent(org)}/${encodeURIComponent(portal)}`;
  const ticketId = search.get('ticket');
  const opened = search.get('opened');
  const articleNo = Number(search.get('article')) || null;
  const post = <T,>(path: string, body: unknown = {}) => portalFetch<T>(org, portal, path, { method: 'POST', body, token });
  // A 401 means the session ended: back to the sign-in.
  const signedIn = <T,>(p: Promise<T>) =>
    p.catch((e: PortalError) => {
      if (e.status === 401) setToken(null);
      throw e;
    });
  const key = ['portal', org, portal];
  const home = useQuery<PortalHome>({ queryKey: [...key, 'home', token], queryFn: () => portalFetch(org, portal, '', { token }), enabled: loaded, retry: false });
  const me = useQuery<PortalMe>({ queryKey: [...key, 'me', token], queryFn: () => signedIn(portalFetch(org, portal, '/me', { token })), enabled: Boolean(token), retry: false });
  const tickets = useQuery<PortalTicketRow[]>({ queryKey: [...key, 'tickets', token], queryFn: () => signedIn(portalFetch(org, portal, '/tickets', { token })), enabled: Boolean(token), retry: false });
  const privacy = useQuery<{ id: string; kind: string; status: string; createdAt: string; decisionNote: string | null }[]>({ queryKey: [...key, 'privacy', token], queryFn: () => signedIn(portalFetch(org, portal, '/privacy-requests', { token })), enabled: Boolean(token), retry: false });
  const ticket = useQuery<PortalTicket>({ queryKey: [...key, 'ticket', ticketId, token], queryFn: () => signedIn(portalFetch(org, portal, `/tickets/${encodeURIComponent(ticketId!)}`, { token })), enabled: Boolean(token && ticketId), retry: false });
  const homeError = home.error as PortalError | null;
  const state: LoadState | 'not-found' = homeError ? (homeError.status === 404 ? 'not-found' : 'error') : !home.data || (token && !me.data && !me.isError) ? 'loading' : 'ready';
  const ticketState: LoadState | undefined = ticketId && token ? (ticket.data ? 'ready' : ticket.isError ? ((ticket.error as PortalError).status === 403 ? 'no-access' : 'error') : 'loading') : undefined;
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const challenge = async () => {
    const c = await botChallengeToken();
    return c ? { challengeToken: c } : {};
  };
  return (
    <PortalScreen
      state={state}
      onRetry={() => void home.refetch()}
      home={home.data ?? null}
      me={token ? (me.data ?? null) : null}
      tickets={tickets.data ?? []}
      ticket={ticketId ? (ticket.data ?? null) : null}
      ticketState={ticketState}
      notice={opened ? `Ticket ${opened} is open.` : null}
      onSendCode={async (email) => {
        await post('/sign-in', { email, ...(await challenge()) });
      }}
      onVerify={async (email, code) => {
        try {
          const r = await post<{ token: string }>('/verify', { email, code });
          setToken(r.token);
        } catch (e) {
          if ((e as PortalError).status === 401) throw new Error('That code is not right or has expired. Ask for a new one.');
          throw e;
        }
      }}
      onAsk={async (input) => {
        await post('/requests', { ...input, ...(await challenge()) });
      }}
      onMeToo={async (id) => {
        await signedIn(post(`/banners/${encodeURIComponent(id)}/me-too`));
        await refresh();
      }}
      onRaise={async (input) => {
        const r = await signedIn(post<{ id: string; number: string }>('/tickets', input));
        await refresh();
        return r;
      }}
      onOpenTicket={(id) => router.push(`${base}?ticket=${encodeURIComponent(id)}`)}
      onBack={() => router.push(base)}
      onReply={async (text) => {
        await signedIn(post(`/tickets/${encodeURIComponent(ticketId!)}/messages`, { text }));
        await refresh();
      }}
      kb={{
        openNumber: articleNo,
        onSearch: (q) => portalFetch<KbSuggestion[]>(org, portal, `/kb/suggest?q=${encodeURIComponent(q)}`, { token }),
        onArticle: (n, lang) => portalFetch<KbArticleView>(org, portal, `/kb/articles/${n}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`, { token }),
        onFeedback: (id, helpful) => post(`/kb/articles/${encodeURIComponent(id)}/feedback`, { helpful }),
        onSolved: (id) => post(`/kb/articles/${encodeURIComponent(id)}/feedback`, { solved: true }),
      }}
      onRate={async (score, comment) => {
        await signedIn(post(`/tickets/${encodeURIComponent(ticketId!)}/rating`, { score, ...(comment ? { comment } : {}) }));
        await refresh();
      }}
      privacy={
        token
          ? {
              requests: privacy.data ?? [],
              onAsk: async (kind, note) => {
                await signedIn(post('/privacy-requests', { kind, ...(note ? { note } : {}) }));
                await refresh();
              },
              onDownload: async (id) => {
                const data = await signedIn(portalFetch<unknown>(org, portal, `/privacy-requests/${encodeURIComponent(id)}/export`, { token }));
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
                a.download = 'my-data.json';
                a.click();
                URL.revokeObjectURL(a.href);
              },
            }
          : undefined
      }
      onSignOut={async () => {
        await post('/sign-out').catch(() => undefined);
        setToken(null);
        queryClient.removeQueries({ queryKey: key });
        router.push(base);
      }}
    />
  );
}

export default function YxPortalPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <PortalPage />
    </Suspense>
  );
}
