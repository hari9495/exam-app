'use client';

import { useRouter } from 'next/navigation';
import { HelpCentreScreen, type MyTicketRow, type PublicBanner, type RaiseDesk } from '@yukthix/ui/desk';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Help centre (HLP-01, M14 SD-1.03/1.04): raise a ticket and follow my tickets. Open to everyone in the
// company (the requester's implicit role); the API returns only the person's own records. Batch 3: known-issue banners
// with "Me too" (US-G-020), reading aids, and times in the person's own time zone.
export default function YxDeskHelpPage() {
  const router = useRouter();
  const me = useCurrentUser();
  const desks = useDesk<RaiseDesk[]>('/my/desks');
  const tickets = useDesk<MyTicketRow[]>('/my/tickets');
  const banners = useDesk<PublicBanner[]>('/my/banners');
  const write = useDeskWrite();
  return (
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
    />
  );
}
