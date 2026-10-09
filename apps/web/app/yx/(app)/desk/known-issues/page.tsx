'use client';

import { useEffect, useState } from 'react';
import { KnownIssuesScreen, type Banner, type DeskSummary, type TicketPage } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Known issues (founder decision 8 Oct 2026): agents post and end known-issue banners for the desks they
// work on, from their own menu (the same banners as Desk set-up › Banners). desk.ticket.work on the API.
export default function YxDeskKnownIssuesPage() {
  const desks = useDesk<DeskSummary[]>('/desks');
  const mine = (desks.data ?? []).filter((d) => d.canWork && d.status !== 'archived');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!selected && mine.length) setSelected(mine[0].id);
  }, [mine[0]?.id, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const banners = useDesk<Banner[]>(selected ? `/desks/${selected}/banners` : null);
  const openTickets = useDesk<TicketPage>(selected ? `/tickets?deskIds=${selected}&states=new,open,pending,on_hold&limit=100` : null);
  const write = useDeskWrite();
  const base = `/desks/${selected}`;
  return (
    <KnownIssuesScreen
      state={deskState(desks)}
      onRetry={() => void desks.refetch()}
      desks={mine}
      selectedId={selected}
      onSelect={setSelected}
      banners={
        selected
          ? {
              state: deskState(banners),
              banners: banners.data ?? [],
              openTickets: (openTickets.data?.items ?? []).map((t) => ({ id: t.id, number: t.number, subject: t.subject })),
              onSave: async (b, input) => {
                await write(b ? `${base}/banners/${b.id}` : `${base}/banners`, b ? 'PATCH' : 'POST', input);
              },
              onEnd: async (b) => {
                await write(`${base}/banners/${b.id}/end`, 'POST');
              },
            }
          : null
      }
    />
  );
}
