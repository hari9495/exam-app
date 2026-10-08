'use client';

import { useCallback, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { BUILT_IN_VIEWS, DeskTicketsScreen, type DeskDetail, type DeskSummary, type Person, type SavedTicketView, type TicketPage, type TicketQuery } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { deskState, filtersQuery, useDesk, useDeskExport, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Tickets (HLP-02, M14 SD-1.07): the agent's queues as a list or a board, saved views, bulk changes for
// team leads, CSV export. The API lists only tickets the person may see (§5.7).
export default function YxDeskTicketsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
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
    <DeskTicketsScreen
      state={deskState(desks, views)}
      onRetry={() => void Promise.all([desks.refetch(), views.refetch(), page.refetch()])}
      desks={working}
      details={details.map((d) => d.data).filter((d): d is DeskDetail => Boolean(d))}
      views={views.data ?? []}
      page={page.data ?? null}
      pageState={page.isError ? 'error' : page.data ? 'ready' : 'loading'}
      query={query}
      onQueryChange={(q) => {
        setLimit(50);
        setQuery(q);
      }}
      onOpen={(id) => router.push(`/yx/desk/tickets/${encodeURIComponent(id)}`)}
      onMove={async (t, statusId) => {
        await write(`/tickets/${t.id}`, 'PATCH', { version: t.version, statusId });
      }}
      onBulk={(ticketIds, action) => write('/tickets/bulk', 'POST', { ticketIds, action })}
      onSaveView={async (name, shared, q) => {
        const deskId = q.filters.deskIds?.length === 1 ? q.filters.deskIds[0] : working.length === 1 ? working[0].id : undefined;
        const v = await write<{ id: string }>('/views', 'POST', { name, shared: shared && Boolean(deskId), deskId, filters: q.filters, layout: q.layout });
        setQuery({ ...q, viewId: v.id });
      }}
      onExport={(q) => exportCsv(filtersQuery(q.filters, { viewId: BUILT_IN_VIEWS.some((v) => v.id === q.viewId) ? undefined : q.viewId }))}
      onSearchPeople={searchPeople}
      onCreate={(input) => write<{ id: string }>('/tickets', 'POST', input)}
      onLoadMore={() => setLimit((l) => Math.min(200, l + 50))}
    />
  );
}
