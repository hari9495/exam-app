'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { RequesterChatScreen, type ChatSession, type MyChatQueue, type PickOption } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { deskState, useDesk, useDeskFile, useDeskUpload, useDeskWrite } from '../../../../../lib/yx-desk';
import { useDeskChat } from '../../../../../lib/yx-desk-chat';

// Service desk › Chat with us (SD-2.18, SD-2.19): the requester's live chats. Open to everyone in the company; the API
// answers only the person's own chats.
function YxDeskChatInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { accessToken } = useAuth();
  const [sel, setSel] = useState<string | null>(search?.get('chat') ?? null);
  const queues = useDesk<MyChatQueue[]>('/my/chat/queues');
  const chats = useDesk<ChatSession[]>('/my/chat', { refetchInterval: 30_000 });
  const current = useDesk<ChatSession>(sel ? `/my/chat/${encodeURIComponent(sel)}` : null);
  const write = useDeskWrite();
  const upload = useDeskUpload();
  const openFile = useDeskFile();
  const refresh = () => {
    void current.refetch();
    void chats.refetch();
  };
  const chat = useDeskChat({ sessionId: sel, events: { onMessage: refresh, onState: refresh, onSeen: () => void current.refetch() } });
  return (
    <RequesterChatScreen
      state={deskState(queues, chats)}
      onRetry={() => void queues.refetch()}
      queues={queues.data ?? []}
      chats={chats.data ?? []}
      current={sel ? (current.data ?? null) : null}
      live={chat.live}
      initialQueueId={search?.get('queue')}
      onStart={async (input) => {
        const s = await write<ChatSession>('/my/chat', 'POST', input);
        setSel(s.id);
      }}
      onOpen={setSel}
      onSend={async (text, card) => {
        await chat.send(sel!, text, card);
        void current.refetch();
      }}
      onUpload={async (file) => {
        const f = (await upload(`/my/chat/${encodeURIComponent(sel!)}/files`, file)) as unknown as { id: string };
        await chat.send(sel!, '', undefined, f.id);
        void current.refetch();
      }}
      onOpenFile={(fileId) => void openFile(`/my/chat/${encodeURIComponent(sel!)}/files/${encodeURIComponent(fileId)}/link`)}
      onTyping={() => sel && chat.typing(sel)}
      onEnd={() => write(`/my/chat/${encodeURIComponent(sel!)}/end`, 'POST')}
      onRate={(score, comment) => write(`/my/chat/${encodeURIComponent(sel!)}/rate`, 'POST', { score, ...(comment ? { comment } : {}) })}
      onOpenTicket={(ticketId) => router.push(`/yx/desk/help/${encodeURIComponent(ticketId)}`)}
      onPick={(kind, q) => apiFetch(`/desk/my/pick/${kind}?q=${encodeURIComponent(q)}`, {}, accessToken ?? undefined) as Promise<PickOption[]>}
    />
  );
}

export default function YxDeskChatPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxDeskChatInner />
    </Suspense>
  );
}
