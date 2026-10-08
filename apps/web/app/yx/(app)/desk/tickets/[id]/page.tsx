'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TicketScreen, type CannedResponse, type DeskDetail, type Person, type Presence, type RequesterContext, type TicketDetail, type TimelineEntry } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useCurrentUser } from '../../../../../../lib/hooks/useCurrentUser';
import { deskState, useDesk, useDeskFile, useDeskUpload, useDeskWrite } from '../../../../../../lib/yx-desk';

// Service desk › Tickets › one ticket (HLP-03, M14 SD-1.08): reply, note, assign, files, time, the requester's other
// tickets, and who else is on it (YX-SD-07, every 15 seconds while the page is open).
export default function YxDeskTicketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const me = useCurrentUser();
  const path = `/tickets/${encodeURIComponent(id)}`;
  const ticket = useDesk<TicketDetail>(path, { refetchInterval: 20_000 });
  const deskId = ticket.data?.deskId ?? null;
  const detail = useDesk<DeskDetail>(deskId ? `/desks/${deskId}` : null);
  const canned = useDesk<CannedResponse[]>(deskId ? `/desks/${deskId}/canned-responses` : null);
  const timeline = useDesk<TimelineEntry[]>(`${path}/timeline`);
  const context = useDesk<RequesterContext>(`${path}/context`);
  const write = useDeskWrite();
  const upload = useDeskUpload();
  const openFile = useDeskFile();
  const [others, setOthers] = useState<Presence[]>([]);
  const typing = useRef(false);

  const beat = useCallback(() => {
    if (!token) return;
    void (apiFetch(`/desk${path}/presence`, { method: 'POST', body: JSON.stringify({ typing: typing.current }) }, token) as Promise<Presence[]>).then(setOthers).catch(() => setOthers([]));
  }, [path, token]);
  useEffect(() => {
    beat();
    const h = setInterval(beat, 15_000);
    return () => clearInterval(h);
  }, [beat]);

  const t = ticket.data;
  const version = t?.version ?? 0;
  return (
    <TicketScreen
      state={deskState(ticket)}
      onRetry={() => void ticket.refetch()}
      ticket={t ?? null}
      detail={detail.data ?? null}
      canned={canned.data ?? []}
      timeline={timeline.data ?? []}
      context={context.data ?? null}
      others={others}
      meName={me.data?.name || me.data?.email || 'Me'}
      meId={me.data?.id ?? ''}
      onBack={() => router.push('/yx/desk/tickets')}
      onUpdate={async (change) => {
        await write(path, 'PATCH', { version, ...change });
      }}
      onAssign={async (userId) => {
        await write(`${path}/assign`, 'POST', { userId });
      }}
      onPost={async (m) => {
        await write(`${path}/messages`, 'POST', m);
      }}
      onUpload={(file) => upload(`${path}/attachments`, file)}
      onOpenFile={(attachmentId) => openFile(`${path}/attachments/${encodeURIComponent(attachmentId)}/link`)}
      onAddTime={async (minutes, note) => {
        await write(`${path}/time-entries`, 'POST', { minutes, ...(note ? { note } : {}) });
      }}
      onRunScenario={async (scenarioId) => {
        await write(`${path}/scenarios/${encodeURIComponent(scenarioId)}`, 'POST', { version });
      }}
      onConvert={async (typeId, reason) => {
        await write(`${path}/convert`, 'POST', { typeId, reason });
      }}
      onAddCollaborator={async (userId) => {
        await write(`${path}/collaborators`, 'POST', { userId });
      }}
      onRemoveCollaborator={async (userId) => {
        await write(`${path}/collaborators/${encodeURIComponent(userId)}`, 'DELETE');
      }}
      onAddWatcher={async (personId) => {
        await write(`${path}/watchers`, 'POST', { personId });
      }}
      onRemoveWatcher={async (watcherId) => {
        await write(`${path}/watchers/${encodeURIComponent(watcherId)}`, 'DELETE');
      }}
      onSearchPeople={(q) => apiFetch(`/desk/people?search=${encodeURIComponent(q)}`, {}, token) as Promise<Person[]>}
      onTyping={(now) => {
        if (now !== typing.current) {
          typing.current = now;
          beat();
        }
      }}
      onOpenTicket={(other) => router.push(`/yx/desk/tickets/${encodeURIComponent(other)}`)}
    />
  );
}
