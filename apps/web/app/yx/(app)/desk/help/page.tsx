'use client';

import { Suspense, useState } from 'react';
import { Spinner } from '@yukthix/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { HelpCentreScreen, type DevOutboxItem, type MyChannels, type KbArticleView, type KbHome, type KbSuggestion, type MyTicketRow, type PickOption, type PublicBanner, type RaiseDesk } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { deskState, useDesk, useDeskUpload, useDeskWrite } from '../../../../../lib/yx-desk';
import { useYxPermissions } from '../../../../../lib/yx-org';

// Helpdesk › Help centre: the designed HLP-01 screen with `live` (Helpdesk design wiring, round 1). Open to everyone in
// the company (the requester's implicit role); the API returns only the person's own records. Search the company's
// help articles (?article=12 opens KB-12), raise a ticket (?new=1 opens the form), follow my tickets with their
// resolution promise, rate a solved one, "Me too" on known issues, reading aids, my data, the chat offer and WhatsApp /
// SMS help.
function YxDeskHelpPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const perms = useYxPermissions();
  const home = useDesk<KbHome>('/my/kb');
  const privacy = useDesk<{ id: string; kind: string; status: string; createdAt: string; decisionNote: string | null }[]>('/my/privacy-requests');
  const desks = useDesk<RaiseDesk[]>('/my/desks');
  const tickets = useDesk<MyTicketRow[]>('/my/tickets');
  const banners = useDesk<PublicBanner[]>('/my/banners');
  const write = useDeskWrite();
  const upload = useDeskUpload();
  // SD-2.19: a proactive chat offer for this page, shown after its delay when an agent is online.
  const prompt = useDesk<{ queueId: string; desk: string; text: string; afterSeconds: number } | null>('/my/chat/prompt?path=/yx/desk/help');
  const [dismissed, setDismissed] = useState(false);
  // SD-2.21 … SD-2.23: link my phone for WhatsApp / SMS help; in demo mode, a pretend phone and what reached it.
  const channels = useDesk<MyChannels>('/my/messaging');
  const outbox = useDesk<DevOutboxItem[]>(channels.data?.devTransport ? '/my/messaging/dev-outbox' : null, { refetchInterval: 3000 });

  return (
    <HelpCentreScreen
      live={{
        state: deskState(desks, tickets),
        onRetry: () => void Promise.all([desks.refetch(), tickets.refetch()]),
        desks: desks.data ?? [],
        tickets: tickets.data ?? [],
        onRaise: (input) => write<{ id: string; number: string }>('/my/tickets', 'POST', input),
        onUpload: (id, file) => upload(`/my/tickets/${encodeURIComponent(id)}/attachments`, file),
        onOpen: (id) => router.push(`/yx/desk/help/${encodeURIComponent(id)}`),
        // Answer 1911: buildings and the areas of one, for a facilities ticket.
        onPickPlace: (kind, q, locationId) => apiFetch(`/desk/my/pick/${kind}?q=${encodeURIComponent(q)}${locationId ? `&locationId=${encodeURIComponent(locationId)}` : ''}`, {}, token) as Promise<PickOption[]>,
        onPickDevice: (q, forPersonId) => apiFetch(`/desk/my/pick/assets?q=${encodeURIComponent(q)}${forPersonId ? `&for=${encodeURIComponent(forPersonId)}` : ''}`, {}, token) as Promise<PickOption[]>,
        // Answer 1801: raising on behalf of a colleague, for people holding request.raise_on_behalf.
        onBehalf: perms.has('request.raise_on_behalf')
          ? {
              // Answer 1846: only the people this person may raise for.
              onPickPeople: (q) => apiFetch(`/desk/my/pick/on-behalf?q=${encodeURIComponent(q)}`, {}, token) as Promise<PickOption[]>,
              onDesksFor: (personId) => apiFetch(`/desk/my/desks?for=${encodeURIComponent(personId)}`, {}, token) as Promise<RaiseDesk[]>,
            }
          : null,
        onRate: (id, score, reason) => write(`/my/tickets/${encodeURIComponent(id)}/rating`, 'POST', { score, ...(reason ? { reason } : {}) }),
        kb: {
          home: home.data ?? null,
          openNumber: Number(params?.get('article')) || null,
          onSearch: (q) => apiFetch(`/desk/my/kb/suggest?q=${encodeURIComponent(q)}`, {}, token) as Promise<KbSuggestion[]>,
          onArticle: (n, lang) => apiFetch(`/desk/my/kb/articles/${n}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`, {}, token) as Promise<KbArticleView>,
          onFeedback: (id, helpful) => write(`/my/kb/articles/${encodeURIComponent(id)}/feedback`, 'POST', { helpful }),
          onSolved: (id) => write(`/my/kb/articles/${encodeURIComponent(id)}/feedback`, 'POST', { solved: true }),
        },
        articleHref: (n) => `/yx/desk/help?article=${n}`,
        banners: banners.data ?? [],
        onMeToo: (id) => write(`/my/banners/${encodeURIComponent(id)}/me-too`, 'POST'),
        privacy: {
          requests: privacy.data ?? [],
          onAsk: (kind, note) => write('/my/privacy-requests', 'POST', { kind, ...(note ? { note } : {}) }),
          onDownload: async (rid) => {
            const data = await apiFetch(`/desk/my/privacy-requests/${encodeURIComponent(rid)}/export`, {}, token);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            a.download = 'my-desk-data.json';
            a.click();
            URL.revokeObjectURL(a.href);
          },
        },
        chatPrompt: dismissed || !prompt.data ? null : { prompt: prompt.data, onChat: () => router.push(`/yx/desk/chat?queue=${encodeURIComponent(prompt.data!.queueId)}`), onDismiss: () => setDismissed(true) },
        channels: channels.data?.lines.length
          ? {
              channels: channels.data,
              onJoinCode: (kind) => write<{ code: string; text: string; expiresInMinutes: number }>('/my/messaging/join', 'POST', { kind }),
              onUnlink: (kind) => write(`/my/messaging/${kind}`, 'DELETE'),
              dev: channels.data.devTransport ? { outbox: outbox.data ?? [], onSend: (kind, text, phone) => write('/my/messaging/dev-send', 'POST', { kind, text, ...(phone ? { phone } : {}) }) } : null,
            }
          : null,
        startRaise: params?.get('new') === '1',
        onBack: () => router.push('/yx/me'),
      }}
    />
  );
}

// useSearchParams needs a Suspense boundary (Next prerender).
export default function YxDeskHelpPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <YxDeskHelpPageInner />
    </Suspense>
  );
}
