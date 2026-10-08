'use client';

import { useRouter } from 'next/navigation';
import { HelpCentreScreen, type MyTicketRow, type RaiseDesk } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Help centre (HLP-01, M14 SD-1.03/1.04): raise a ticket and follow my tickets. Open to everyone in the
// company (the requester's implicit role); the API returns only the person's own records.
export default function YxDeskHelpPage() {
  const router = useRouter();
  const desks = useDesk<RaiseDesk[]>('/my/desks');
  const tickets = useDesk<MyTicketRow[]>('/my/tickets');
  const write = useDeskWrite();
  return (
    <HelpCentreScreen
      state={deskState(desks, tickets)}
      onRetry={() => void Promise.all([desks.refetch(), tickets.refetch()])}
      desks={desks.data ?? []}
      tickets={tickets.data ?? []}
      onRaise={(input) => write<{ id: string; number: string }>('/my/tickets', 'POST', input)}
      onOpen={(id) => router.push(`/yx/desk/help/${encodeURIComponent(id)}`)}
    />
  );
}
