'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ClientPortalScreen, PortalSignInScreen, type LiveClientPortal, type LiveClientTab } from '@yukthix/ui/hiring';
import { apiFetch, apiFetchBlob } from '../../../../lib/api-client';
import { otpSignIn } from '../../../../lib/yx-portal';

const TABS: LiveClientTab[] = ['jobs', 'submissions', 'interviews', 'timesheets', 'invoices', 'tickets'];
type TicketRows = NonNullable<LiveClientPortal['tickets']>['rows'];

// T9-06 client portal (staffing slice 3, answer 453): a client contact the account manager gave access signs in with a
// one-time code by email, then a session (this tab only) sees only their own company's jobs, submissions, timesheets
// and invoices, and raises and follows Helpdesk tickets (answer 491). A call answered 401 part-way (the session ended) shows "sign in again".
export default function YxClientPortalPage() {
  const router = useRouter();
  const { org } = useParams<{ org: string }>();
  const params = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as LiveClientTab) ? params.get('tab') : 'jobs') as LiveClientTab;
  const base = `/public/client-portal/${encodeURIComponent(org)}`;
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<LiveClientPortal['data']>(null);
  const [state, setState] = useState<LiveClientPortal['state']>('loading');
  const [tickets, setTickets] = useState<TicketRows>([]);
  const [ended, setEnded] = useState(false);
  const headers = (t: string) => ({ 'X-Client-Portal': t });
  const call = async <T,>(path: string, t: string, init: RequestInit = {}): Promise<T> => {
    try {
      return (await apiFetch(`${base}${path}`, { ...init, headers: headers(t) })) as T;
    } catch (e) {
      if ((e as { status?: number }).status === 401) setEnded(true);
      throw e;
    }
  };
  const load = async (t: string) => {
    setState('loading');
    try {
      const [me, rows] = await Promise.all([call<LiveClientPortal['data']>('/me', t), call<TicketRows>('/tickets', t)]);
      setData(me);
      setTickets(rows);
      setState('ready');
    } catch {
      setState('error');
    }
  };
  if (!token)
    return (
      <PortalSignInScreen
        tenant={org}
        portal="Client portal"
        footer={{ privacy: 'Privacy notice for client contacts (G-09)' }}
        signIn={{
          title: 'Sign in to the client portal',
          intro: 'Use your work email. You also accept the confidentiality and no-onward-sharing undertaking.',
          notice: 'client confidentiality undertaking (G-09)',
          live: otpSignIn(base, async (t) => {
            setToken(t);
            await load(t);
          }),
        }}
      />
    );
  return (
    <ClientPortalScreen
      live={{
        tenant: org,
        tab,
        hrefFor: (t) => `?tab=${t}`,
        // Walk finding: a plain link reloaded the page and signed the contact out.
        onTab: (t) => router.push(`?tab=${t}`, { scroll: false }),
        state,
        onRetry: () => void load(token),
        ended,
        onSignInAgain: () => (setToken(null), setData(null), setEnded(false)),
        onSignOut: () => {
          void call('/sign-out', token, { method: 'POST' }).catch(() => undefined);
          setToken(null);
          setData(null);
        },
        today: new Date(),
        data,
        onDecide: async (id, decision, feedback) => {
          await call(`/submissions/${encodeURIComponent(id)}/decision`, token, { method: 'POST', body: JSON.stringify({ decision, ...(feedback ? { feedback } : {}) }) });
          await load(token);
        },
        onBook: async (input) => {
          await call('/interviews', token, { method: 'POST', body: JSON.stringify({ ...input, ...(input.panel ? {} : { panel: undefined }) }) });
          await load(token);
        },
        onPdf: (invoiceId) =>
          void apiFetchBlob(`${base}/invoices/${encodeURIComponent(invoiceId)}/pdf`, { headers: headers(token) })
            .then(({ blob, filename }) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename ?? 'invoice.pdf';
              a.click();
              URL.revokeObjectURL(url);
            })
            .catch((e: { status?: number }) => e.status === 401 && setEnded(true)),
        tickets: {
          rows: tickets,
          // Answer 923: the reply email links here (sign in, then this ticket).
          openId: params.get('ticket') ?? undefined,
          onRaise: async (input) => {
            const made = await call<{ id: string; number: string }>('/tickets', token, { method: 'POST', body: JSON.stringify(input) });
            setTickets(await call<TicketRows>('/tickets', token));
            return made;
          },
          load: (id) => call(`/tickets/${encodeURIComponent(id)}`, token),
          onReply: async (id, text) => {
            await call(`/tickets/${encodeURIComponent(id)}/reply`, token, { method: 'POST', body: JSON.stringify({ text }) });
            setTickets(await call<TicketRows>('/tickets', token));
          },
        },
        // Answer 1408: this client's own project lines, approved or sent back with a note.
        onProjectHours: async (id, action, note) => {
          await call(`/project-hours/${encodeURIComponent(id)}/${action === 'approve' ? 'approve' : 'send-back'}`, token, { method: 'POST', body: JSON.stringify(action === 'approve' ? {} : { note }) });
          await load(token);
        },
        onTimesheet: async (id, action) => {
          await call(`/timesheets/${encodeURIComponent(id)}/${action === 'approve' ? 'approve' : 'send-back'}`, token, { method: 'POST', body: JSON.stringify({}) });
          await load(token);
        },
      }}
    />
  );
}
