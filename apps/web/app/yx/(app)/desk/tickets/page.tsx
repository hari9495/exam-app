'use client';

import { useCallback, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AgentDeskScreen, BUILT_IN_VIEWS, type DeskDetail, type DeskSummary, type Person, type SavedTicketView, type NotFoundLookup, type TicketPage, type TicketQuery } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { deskState, filtersQuery, useDesk, useDeskExport, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk › Tickets: the designed HLP-02 agent desk with `live` (Helpdesk design wiring, round 2). The agent's queues
// as a list or a board, saved views, the quick view, bulk changes for team leads, moving to another desk, a new
// ticket for an employee, CSV export. The API lists only tickets the person may see (§5.7) and checks every action.
export default function YxDeskTicketsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const me = useCurrentUser();
  const [query, setQuery] = useState<TicketQuery>({ viewId: 'mine', filters: BUILT_IN_VIEWS[0].filters, layout: 'list' });
  const [limit, setLimit] = useState(50);
  const desks = useDesk<DeskSummary[]>('/desks');
  const views = useDesk<SavedTicketView[]>('/views');
  const custom = !BUILT_IN_VIEWS.some((v) => v.id === query.viewId);
  const page = useDesk<TicketPage>(`/tickets?${filtersQuery(query.filters, { viewId: custom ? query.viewId : undefined, limit: String(limit) })}`);
  const working = (desks.data ?? []).filter((d) => d.myRole);
  const details = useQueries({
    queries: working.map((d) => ({ queryKey: ['desk', `/desks/${d.id}`], queryFn: () => apiFetch(`/desk/desks/${d.id}`, {}, token) as Promise<DeskDetail>, enabled: Boolean(token), retry: false })),
  });
  const write = useDeskWrite();
  const exportCsv = useDeskExport();
  const searchPeople = useCallback((q: string) => apiFetch(`/desk/people?search=${encodeURIComponent(q)}`, {}, token) as Promise<Person[]>, [token]);
  return (
    <AgentDeskScreen
      live={{
        state: deskState(desks, views),
        onRetry: () => void Promise.all([desks.refetch(), views.refetch(), page.refetch()]),
        desks: desks.data ?? [],
        details: details.map((d) => d.data).filter((d): d is DeskDetail => Boolean(d)),
        views: views.data ?? [],
        page: page.data ?? null,
        pageState: page.isError ? 'error' : page.data ? 'ready' : 'loading',
        query,
        onQueryChange: (q) => {
          setLimit(50);
          setQuery(q);
        },
        meId: me.data?.id ?? null,
        onOpen: (id) => router.push(`/yx/desk/tickets/${encodeURIComponent(id)}`),
        onAssignToMe: (t) => write(`/tickets/${t.id}/assign`, 'POST', { userId: me.data?.id }),
        onMove: (t, statusId) => write(`/tickets/${t.id}`, 'PATCH', { version: t.version, statusId }),
        onBulk: (ticketIds, action) => write('/tickets/bulk', 'POST', { ticketIds, action }),
        onMoveDesk: (id, deskId, reason) => write(`/tickets/${id}/move`, 'POST', { deskId, reason }),
        onSaveView: async (name, shared, q) => {
          const deskId = q.filters.deskIds?.length === 1 ? q.filters.deskIds[0] : working.length === 1 ? working[0].id : undefined;
          const v = await write<{ id: string }>('/views', 'POST', { name, shared: shared && Boolean(deskId), deskId, filters: q.filters, layout: q.layout });
          setQuery({ ...q, viewId: v.id });
        },
        onExport: (q) => exportCsv(filtersQuery(q.filters, { viewId: BUILT_IN_VIEWS.some((v) => v.id === q.viewId) ? undefined : q.viewId })),
        onSearchPeople: searchPeople,
        onCreate: (input) => write<{ id: string }>('/tickets', 'POST', input),
        onLoadMore: () => setLimit((l) => Math.min(200, l + 50)),
        // Answer 947: the reference a person reads out from a Not found page (who, when, which page; never whether it exists).
        onLookUpReference: (code) => apiFetch(`/help/not-found/${encodeURIComponent(code)}`, {}, token) as Promise<NotFoundLookup>,
      }}
    />
  );
}
