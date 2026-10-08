'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgentChatScreen, type ChatQueue, type ChatSession, type DeskDetail, type DeskSummary, type InteractionView } from '@yukthix/ui/desk';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { deskState, useDesk, useDeskFile, useDeskUpload, useDeskWrite } from '../../../../../lib/yx-desk';
import { useDeskChat } from '../../../../../lib/yx-desk-chat';

// Service desk › Live chat (SD-2.17 … SD-2.19): the chat queue of a desk for its agents (desk.chat.work and an agent
// seat, checked on every route and socket event), and calls and walk-ups logged as interactions.
export default function YxDeskLiveChatPage() {
  const router = useRouter();
  const me = useCurrentUser();
  const desks = useDesk<DeskSummary[]>('/desks');
  const mine = (desks.data ?? []).filter((d) => d.canWork);
  const [deskId, setDeskId] = useState<string | null>(null);
  useEffect(() => {
    if (!deskId && mine.length) setDeskId(mine[0].id);
  }, [mine.length, deskId]);
  const [sel, setSel] = useState<string | null>(null);
  const list = useDesk<{ mine: number; sessions: ChatSession[] }>(deskId ? `/chat/sessions?deskId=${deskId}` : null, { refetchInterval: 20_000 });
  const current = useDesk<ChatSession>(sel ? `/chat/sessions/${encodeURIComponent(sel)}` : null);
  const queues = useDesk<ChatQueue[]>(deskId ? `/chat/queues?deskId=${deskId}` : null);
  const detail = useDesk<DeskDetail>(deskId ? `/desks/${deskId}` : null);
  const interactions = useDesk<{ firstContactResolution: number | null; interactions: InteractionView[] }>(deskId ? `/interactions?deskId=${deskId}` : null);
  const write = useDeskWrite();
  const upload = useDeskUpload();
  const openFile = useDeskFile();
  const refresh = () => {
    void list.refetch();
    void current.refetch();
  };
  const chat = useDeskChat({ sessionId: sel, deskId, events: { onMessage: () => void current.refetch(), onState: refresh, onSeen: () => void current.refetch(), onQueue: () => void list.refetch() } });
  const path = `/chat/sessions/${encodeURIComponent(sel ?? '')}`;
  const agents = (detail.data?.members ?? []).filter((m) => m.role === 'agent' || m.role === 'lead').map((m) => ({ id: m.userId, name: m.name }));
  return (
    <AgentChatScreen
      state={deskState(desks)}
      onRetry={() => void desks.refetch()}
      desks={mine.map((d) => ({ id: d.id, name: d.name }))}
      deskId={deskId}
      onDesk={(id) => {
        setDeskId(id);
        setSel(null);
      }}
      meId={me.data?.id ?? ''}
      sessions={list.data?.sessions ?? []}
      current={sel ? (current.data ?? null) : null}
      live={chat.live}
      queues={(queues.data ?? []).filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))}
      agents={agents}
      onOpen={setSel}
      onAccept={async (id) => {
        await write(`/chat/sessions/${encodeURIComponent(id)}/accept`, 'POST');
        setSel(id);
      }}
      onSend={async (text, card) => {
        await chat.send(sel!, text, card);
        void current.refetch();
      }}
      onUpload={async (file) => {
        const f = (await upload(`${path}/files`, file)) as unknown as { id: string };
        await chat.send(sel!, '', undefined, f.id);
      }}
      onOpenFile={(fileId) => void openFile(`${path}/files/${encodeURIComponent(fileId)}/link`)}
      onTyping={() => sel && chat.typing(sel)}
      onTransfer={(to) => write(`${path}/transfer`, 'POST', to)}
      onEnd={(resolved) => write(`${path}/end`, 'POST', { resolved })}
      onOpenTicket={(ticketId) => router.push(`/yx/desk/tickets/${encodeURIComponent(ticketId)}`)}
      interactions={interactions.data?.interactions ?? []}
      firstContactResolution={interactions.data?.firstContactResolution ?? null}
      onLog={(input) => write('/interactions', 'POST', { deskId, ...input })}
      onPromote={(i) => write(`/interactions/${encodeURIComponent(i.id)}/promote`, 'POST', {})}
      onCloseInteraction={(i) => write(`/interactions/${encodeURIComponent(i.id)}`, 'PATCH', { version: i.version, outcome: 'resolved' })}
    />
  );
}
