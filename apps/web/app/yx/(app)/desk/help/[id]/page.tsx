'use client';

import { useParams, useRouter } from 'next/navigation';
import { MyTicketScreen, type MyTicket } from '@yukthix/ui/desk';
import { useCurrentUser } from '../../../../../../lib/hooks/useCurrentUser';
import { deskState, useDesk, useDeskFile, useDeskUpload, useDeskWrite } from '../../../../../../lib/yx-desk';

// Service desk › Help centre › one ticket (HLP-01, YX-SD-16): the requester's view, replies only (never internal notes).
export default function YxDeskMyTicketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useCurrentUser();
  const path = `/my/tickets/${encodeURIComponent(id)}`;
  // Files show "being checked" until the scan finishes; the page looks again every 10 seconds while any is pending.
  const ticket = useDesk<MyTicket>(path, { refetchInterval: 10_000 });
  const write = useDeskWrite();
  const upload = useDeskUpload();
  const openFile = useDeskFile();
  return (
    <MyTicketScreen
      state={deskState(ticket)}
      onRetry={() => void ticket.refetch()}
      ticket={ticket.data ?? null}
      timeZone={me.data?.timeZone ?? undefined}
      onBack={() => router.push('/yx/desk/help')}
      onReply={async (text, attachmentIds) => {
        await write(`${path}/messages`, 'POST', { text, attachmentIds });
      }}
      onUpload={(file) => upload(`${path}/attachments`, file)}
      onOpenFile={(attachmentId) => openFile(`${path}/attachments/${encodeURIComponent(attachmentId)}/link`)}
      onAddWatcher={async (email) => {
        await write(`${path}/watchers`, 'POST', { email });
      }}
    />
  );
}
