'use client';

import { useParams, useRouter } from 'next/navigation';
import { MyDocumentsCard, MyTicketScreen, RequestTracker, type MyRequestView, type MyTicket, type RequestDocument } from '@yukthix/ui/desk';
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
  // 3b-2: a catalogue request shows what was ordered and its stages, with cancel while it can.
  const request = useDesk<MyRequestView>(`/my/requests/${encodeURIComponent(id)}`);
  // SD-2.07: documents made inside the request, signed here in the app.
  const docs = useDesk<RequestDocument[]>(`/my/requests/${encodeURIComponent(id)}/documents`);
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
      onRate={(score, comment) => write(`${path}/rating`, 'POST', { score, ...(comment ? { comment } : {}) })}
      request={
        request.data?.items.length || docs.data?.length ? (
          <>
            {docs.data?.length ? (
              <MyDocumentsCard
                documents={docs.data}
                onSendCode={(doc) => write<{ to: string; minutes: number }>(`/my/documents/${encodeURIComponent(doc.id)}/sign-code`, 'POST')}
                onSign={(doc, typedName, code) => write(`/my/documents/${encodeURIComponent(doc.id)}/sign`, 'POST', { decision: 'sign', typedName, agree: true, code })}
                onDecline={(doc, reason) => write(`/my/documents/${encodeURIComponent(doc.id)}/sign`, 'POST', { decision: 'decline', typedName: '', reason })}
              />
            ) : null}
            {request.data?.items.length ? (
              <RequestTracker
                request={request.data}
                timeZone={me.data?.timeZone ?? undefined}
                onCancel={(itemId, reason) => write(itemId ? `/my/requests/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/cancel` : `/my/requests/${encodeURIComponent(id)}/cancel`, 'POST', reason ? { reason } : {})}
              />
            ) : null}
          </>
        ) : null
      }
    />
  );
}
