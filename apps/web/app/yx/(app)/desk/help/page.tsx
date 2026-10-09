'use client';

import { Suspense, useState } from 'react';
import { Spinner } from '@yukthix/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChatPromptBanner, HelpCentreScreen, MyChannelsCard, type DevOutboxItem, type MyChannels, type KbArticleView, type KbHome, type KbSuggestion, type MyTicketRow, type PublicBanner, type RaiseDesk } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Help centre (HLP-01, M14 SD-1.03/1.04): raise a ticket and follow my tickets. Open to everyone in the
// company (the requester's implicit role); the API returns only the person's own records. Batch 3: known-issue banners
// with "Me too" (US-G-020), reading aids, and times in the person's own time zone. Batch 4: the company's help articles,
// suggestions while typing and "This solved it" (SD-1.24, US-B-105); ?article=12 opens article KB-12.
function YxDeskHelpPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const home = useDesk<KbHome>('/my/kb');
  const openNumber = Number(params?.get('article')) || null;
  const privacy = useDesk<{ id: string; kind: string; status: string; createdAt: string; decisionNote: string | null }[]>('/my/privacy-requests');
  const me = useCurrentUser();
  const desks = useDesk<RaiseDesk[]>('/my/desks');
  const tickets = useDesk<MyTicketRow[]>('/my/tickets');
  const banners = useDesk<PublicBanner[]>('/my/banners');
  const write = useDeskWrite();
  // SD-2.19: a proactive chat offer for this page, shown after its delay when an agent is online.
  const prompt = useDesk<{ queueId: string; desk: string; text: string; afterSeconds: number } | null>('/my/chat/prompt?path=/yx/desk/help');
  const [dismissed, setDismissed] = useState(false);
  // SD-2.21 … SD-2.23: link my phone for WhatsApp / SMS help; in demo mode, a pretend phone and what reached it.
  const channels = useDesk<MyChannels>('/my/messaging');
  const outbox = useDesk<DevOutboxItem[]>(channels.data?.devTransport ? '/my/messaging/dev-outbox' : null, { refetchInterval: 3000 });

  return (
    <>
    {!dismissed && <div className="yx-auth__page"><ChatPromptBanner prompt={prompt.data ?? null} onChat={() => router.push(`/yx/desk/chat?queue=${encodeURIComponent(prompt.data!.queueId)}`)} onDismiss={() => setDismissed(true)} /></div>}
    <HelpCentreScreen
      state={deskState(desks, tickets)}
      onRetry={() => void Promise.all([desks.refetch(), tickets.refetch()])}
      desks={desks.data ?? []}
      tickets={tickets.data ?? []}
      onRaise={(input) => write<{ id: string; number: string }>('/my/tickets', 'POST', input)}
      onOpen={(id) => router.push(`/yx/desk/help/${encodeURIComponent(id)}`)}
      banners={banners.data ?? []}
      onMeToo={(id) => write(`/my/banners/${encodeURIComponent(id)}/me-too`, 'POST')}
      timeZone={me.data?.timeZone ?? undefined}
      privacy={{
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
      }}
      kb={{
        home: home.data ?? null,
        openNumber,
        onSearch: (q) => apiFetch(`/desk/my/kb/suggest?q=${encodeURIComponent(q)}`, {}, token) as Promise<KbSuggestion[]>,
        onArticle: (n, lang) => apiFetch(`/desk/my/kb/articles/${n}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`, {}, token) as Promise<KbArticleView>,
        onFeedback: (id, helpful) => write(`/my/kb/articles/${encodeURIComponent(id)}/feedback`, 'POST', { helpful }),
        onSolved: (id) => write(`/my/kb/articles/${encodeURIComponent(id)}/feedback`, 'POST', { solved: true }),
      }}
    />
    {channels.data?.lines.length ? (
      <div className="yx-auth__page">
        <MyChannelsCard
          channels={channels.data}
          onJoinCode={(kind) => write<{ code: string; text: string; expiresInMinutes: number }>('/my/messaging/join', 'POST', { kind })}
          onUnlink={(kind) => write(`/my/messaging/${kind}`, 'DELETE')}
          dev={channels.data.devTransport ? { outbox: outbox.data ?? [], onSend: (kind, text, phone) => write('/my/messaging/dev-send', 'POST', { kind, text, ...(phone ? { phone } : {}) }) } : null}
        />
      </div>
    ) : null}
    </>
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
