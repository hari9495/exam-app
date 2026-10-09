import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { KanbanBoard, type KanbanColumn } from '../../components/kanban';
import { RichTextEditor } from '../../components/editor';
import { MenuItem } from '../../components/menu';
import { Dialog } from '../../components/overlay';
import type { FilterValue } from '../../lib/table';
import { useRun } from '../org/org-kit';
import { DeskPage, OPEN_STATES, PRIORITY_LABEL, PriorityBadge, STATE_LABEL, StatusBadge, TicketFlags, when } from './desk-kit';
import type { DeskDetail, DeskSummary, LoadState, Person, SavedTicketView, SystemState, TicketFilters, TicketPage, TicketRow } from './types';

// HLP-02 Agent desk, wired (US-B-089, US-G-002, US-G-010, SD-1.07): queue views, filters, saved views, the board,
// bulk changes for team leads, scenarios, tags and CSV export. The server applies who may see what; the screen only
// offers the actions the person may take.

export interface TicketQuery {
  viewId: string;
  filters: TicketFilters;
  layout: 'list' | 'board';
}

/** Built-in views; saved views come from the server. */
export const BUILT_IN_VIEWS: { id: string; name: string; filters: TicketFilters }[] = [
  { id: 'mine', name: 'My open tickets', filters: { assignee: 'me', states: OPEN_STATES } },
  { id: 'unassigned', name: 'Unassigned', filters: { assignee: 'none', states: OPEN_STATES } },
  { id: 'open', name: 'All open', filters: { states: OPEN_STATES } },
  { id: 'breaching', name: 'Breaching soon', filters: { breaching: true, states: OPEN_STATES } },
  { id: 'snoozed', name: 'Snoozed by me', filters: { snoozed: 'only' } },
  { id: 'all', name: 'All tickets', filters: {} },
];

export interface DeskTicketsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  desks: DeskSummary[];
  /** Set-up of the desks the person works on (statuses for the board and bulk changes, scenarios). */
  details: DeskDetail[];
  views: SavedTicketView[];
  page: TicketPage | null;
  pageState: 'ready' | 'loading' | 'error';
  query: TicketQuery;
  onQueryChange: (q: TicketQuery) => void;
  onOpen: (id: string) => void;
  onMove: (ticket: TicketRow, statusId: string) => Promise<void>;
  onBulk: (ids: string[], action: { assignee?: string | null; priority?: number; priorityReason?: string; addTags?: string[]; statusId?: string; scenarioId?: string }) => Promise<{ done: string[]; failed: { id: string; reason: string }[] }>;
  onSaveView: (name: string, shared: boolean, q: TicketQuery) => Promise<void>;
  onExport: (q: TicketQuery) => Promise<void>;
  onSearchPeople: (q: string) => Promise<Person[]>;
  onCreate: (input: { deskId: string; requesterPersonId: string; subject: string; bodyHtml: string; categoryId?: string }) => Promise<{ id: string }>;
  onLoadMore?: () => void;
}

const fromFilters = (f: TicketFilters): FilterValue[] => [
  ...(f.deskIds?.length ? [{ key: 'desk', type: 'multi' as const, values: f.deskIds }] : []),
  ...(f.states?.length ? [{ key: 'state', type: 'multi' as const, values: f.states }] : []),
  ...(f.priorities?.length ? [{ key: 'priority', type: 'multi' as const, values: f.priorities.map(String) }] : []),
];
const toFilters = (base: TicketFilters, v: FilterValue[], search: string): TicketFilters => {
  const multi = (k: string) => (v.find((x) => x.key === k && x.type === 'multi') as { values: string[] } | undefined)?.values ?? [];
  return { ...base, deskIds: multi('desk'), states: multi('state') as SystemState[], priorities: multi('priority').map(Number), search: search || undefined };
};

export function DeskTicketsScreen(props: DeskTicketsScreenProps) {
  const { query } = props;
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState(query.filters.search ?? '');
  const [creating, setCreating] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [tagging, setTagging] = useState(false);
  const { busy, error, run } = useRun();
  const rows = props.page?.items ?? [];
  const working = props.desks.filter((d) => d.canWork);
  const statusesOf = (deskId: string) => props.details.find((d) => d.desk.id === deskId)?.statuses.filter((s) => s.active) ?? [];
  const lead = rows.some((r) => r.canBulk);
  useEffect(() => setSelected([]), [query]);

  const fields: FilterFieldDef[] = [
    ...(props.desks.length > 1 ? [{ key: 'desk', label: 'Desk', type: 'multi' as const, options: props.desks.map((d) => ({ value: d.id, label: d.name })) }] : []),
    { key: 'state', label: 'State', type: 'multi', options: (Object.keys(STATE_LABEL) as SystemState[]).map((s) => ({ value: s, label: STATE_LABEL[s] })) },
    { key: 'priority', label: 'Priority', type: 'multi', options: [1, 2, 3, 4].map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] })) },
  ];
  const builtIn = BUILT_IN_VIEWS.find((v) => v.id === query.viewId);
  const saved = props.views.find((v) => v.id === query.viewId);
  const base = builtIn?.filters ?? saved?.filters ?? {};
  const setFilters = (v: FilterValue[], s = search) => props.onQueryChange({ ...query, filters: toFilters(base, v, s) });

  const columns: TableColumn<TicketRow>[] = [
    { key: 'number', header: 'Ticket', type: 'id', value: (t) => t.number, width: 110, hideable: false },
    {
      key: 'subject',
      header: 'Subject',
      value: (t) => t.subject,
      render: (t) => (
        <span className="yx-ops-row">
          <span>{t.subject}</span>
          <TicketFlags sensitive={t.sensitive} private={t.private} vip={t.vip} unverified={t.senderVerified === false} />
        </span>
      ),
      width: 320,
    },
    { key: 'requester', header: 'Requester', type: 'person', value: (t) => t.requester ?? '', person: (t) => ({ name: t.requester ?? 'Someone', secondary: t.requestedFor ? `for ${t.requestedFor}` : undefined }), width: 200 },
    { key: 'status', header: 'Status', value: (t) => t.status, render: (t) => <StatusBadge label={t.status} state={t.systemState} />, width: 170 },
    { key: 'priority', header: 'Priority', value: (t) => t.priority, render: (t) => <PriorityBadge priority={t.priority} />, width: 130 },
    {
      key: 'sla',
      header: 'Due',
      value: (t) => t.sla?.dueAt ?? '',
      render: (t) =>
        !t.sla ? (
          <span className="yx-ops-muted">—</span>
        ) : t.sla.breached ? (
          <Badge tone="danger">Target missed</Badge>
        ) : t.sla.paused && !t.sla.dueAt ? (
          <Badge tone="warning">Paused</Badge>
        ) : (
          <span>{when(t.sla.dueAt)}</span>
        ),
      width: 170,
    },
    { key: 'assignee', header: 'Owner', value: (t) => t.assignee ?? 'Unassigned', width: 160 },
    { key: 'desk', header: 'Desk', value: (t) => t.desk, width: 140, optional: true },
    { key: 'category', header: 'Category', value: (t) => t.category ?? '—', width: 160, optional: true },
    { key: 'tags', header: 'Tags', value: (t) => t.tags.join(', '), width: 160, optional: true },
    { key: 'updated', header: 'Updated', value: (t) => t.updatedAt, render: (t) => when(t.updatedAt), width: 170, optional: true },
  ];

  const board: KanbanColumn[] = useMemo(
    () =>
      (['new', 'open', 'pending', 'on_hold', 'solved'] as SystemState[]).map((s) => ({
        id: s,
        title: STATE_LABEL[s],
        cards: rows
          .filter((t) => t.systemState === s)
          .map((t) => ({ id: t.id, name: t.subject, facts: [`${t.number} · ${t.requester ?? ''}`, t.assignee ?? 'Unassigned'] as [string, string], daysInStage: Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86_400_000) })),
        emptyText: 'No tickets',
      })),
    [rows],
  );

  const bulk = (action: Parameters<DeskTicketsScreenProps['onBulk']>[1]) =>
    void run('bulk', async () => {
      const r = await props.onBulk(selected, action);
      setBulkResult(r.failed.length ? `${r.done.length} changed. ${r.failed.length} not changed: ${r.failed.map((f) => f.reason).join('; ')}` : `${r.done.length} changed.`);
      setSelected([]);
    });

  return (
    <DeskPage
      title="Tickets"
      description={working.length ? `Your desks: ${working.map((d) => d.name).join(', ')}.` : 'Tickets of the desks you are on.'}
      state={props.state}
      onRetry={props.onRetry}
      what="tickets"
      actions={
        <>
          <Segment label="Show as" options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]} value={query.layout} onChange={(layout) => props.onQueryChange({ ...query, layout })} />
          {working.length > 0 && (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New ticket
            </Button>
          )}
        </>
      }
    >
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      {bulkResult && <InlineAlert tone="info">{bulkResult}</InlineAlert>}
      {query.layout === 'board' ? (
        <div className="yx-ops-stack">
          <FilterBar fields={fields} value={fromFilters(query.filters)} onChange={(v) => setFilters(v)} search={search} onSearchChange={(s) => { setSearch(s); setFilters(fromFilters(query.filters), s); }} searchPlaceholder="Search number or subject" />
          {rows.length === 0 ? (
            <EmptyState title="No tickets here." description="Change the view or filters to see more." />
          ) : (
            <KanbanBoard
              aria-label="Tickets by state"
              columns={board}
              noun="ticket"
              onOpenCard={props.onOpen}
              onMove={(cardId, _from, to) => {
                const t = rows.find((r) => r.id === cardId);
                const status = t && statusesOf(t.deskId).find((s) => s.systemState === to && !s.ticketTypeId);
                if (t && status) void run('move', () => props.onMove(t, status.id));
              }}
            />
          )}
        </div>
      ) : (
        <DataTable
          label="Tickets"
          columns={columns}
          rows={rows}
          getRowId={(t) => t.id}
          state={props.pageState}
          onRetry={props.onRetry}
          errorTitle="We couldn't load tickets."
          empty={<EmptyState title="No tickets in this view." description="New tickets appear here as soon as they are raised." />}
          filtered={fromFilters(query.filters).length > 0 || Boolean(query.filters.search)}
          onClearFilters={() => {
            setSearch('');
            props.onQueryChange({ ...query, filters: base });
          }}
          selectable={lead}
          isSelectable={(t) => t.canBulk || 'Only a team lead of this desk changes many tickets at once'}
          selectedIds={selected}
          onSelectedChange={setSelected}
          bulkActions={() => {
            const one = rows.find((r) => r.id === selected[0]);
            const sameDesk = rows.filter((r) => selected.includes(r.id)).every((r) => r.deskId === one?.deskId);
            const scenarios = (one && sameDesk && props.details.find((d) => d.desk.id === one.deskId)?.scenarios.filter((s) => s.active)) || [];
            return (
              <>
                <Button size="sm" loading={busy === 'bulk'} onClick={() => bulk({ assignee: 'me' })}>
                  Assign to me
                </Button>
                <Button size="sm" onClick={() => bulk({ priority: 2, priorityReason: 'Raised together by the team lead' })}>
                  Set P2 · High
                </Button>
                <Button size="sm" onClick={() => setTagging(true)}>
                  Add a tag
                </Button>
                {scenarios.slice(0, 2).map((s) => (
                  <Button key={s.id} size="sm" onClick={() => bulk({ scenarioId: s.id })}>
                    Run “{s.name}”
                  </Button>
                ))}
              </>
            );
          }}
          rowActions={(t) => (t.canBulk || props.desks.find((d) => d.id === t.deskId)?.canWork ? <MenuItem onSelect={() => props.onOpen(t.id)}>Open ticket</MenuItem> : null)}
          onRowClick={(t) => props.onOpen(t.id)}
          toolbar={<FilterBar fields={fields} value={fromFilters(query.filters)} onChange={(v) => setFilters(v)} search={search} onSearchChange={(s) => { setSearch(s); setFilters(fromFilters(query.filters), s); }} searchPlaceholder="Search number or subject" />}
          views={
            <SavedViewMenu
              views={[...BUILT_IN_VIEWS.map((v) => ({ id: v.id, name: v.name, shared: true })), ...props.views.map((v) => ({ id: v.id, name: v.name, shared: v.shared }))]}
              currentId={query.viewId}
              onSelect={(viewId) => {
                const v = BUILT_IN_VIEWS.find((x) => x.id === viewId) ?? props.views.find((x) => x.id === viewId);
                setSearch('');
                props.onQueryChange({ ...query, viewId, filters: v?.filters ?? {} });
              }}
              modified={JSON.stringify(query.filters) !== JSON.stringify(base)}
              onSaveAs={(name, shared) => void run('view', () => props.onSaveView(name, shared, query))}
            />
          }
          onExport={() => void run('export', () => props.onExport(query))}
          rowNoun={['ticket', 'tickets']}
        />
      )}
      {props.page?.nextCursor && props.onLoadMore && (
        <div className="yx-ops-row">
          <Button onClick={props.onLoadMore}>Show more ({props.page.total - rows.length} more)</Button>
        </div>
      )}
      <TagDialog open={tagging} onOpenChange={setTagging} onSave={(tag) => bulk({ addTags: [tag] })} />
      <NewTicketDrawer open={creating} onOpenChange={setCreating} desks={working} details={props.details} onSearchPeople={props.onSearchPeople} onCreate={async (input) => { const r = await props.onCreate(input); props.onOpen(r.id); return r; }} />
    </DeskPage>
  );
}

function TagDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (tag: string) => void }) {
  const [tag, setTag] = useState('');
  const ok = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u.test(tag.trim());
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a tag"
      description="Letters, digits, spaces, dashes. Up to 40."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              onSave(tag.trim());
              setTag('');
              onOpenChange(false);
            }}
          >
            Add tag
          </Button>
        </>
      }
    >
      <FormField label="Tag">
        <TextField value={tag} onChange={setTag} maxLength={40} />
      </FormField>
    </Dialog>
  );
}

/** An agent raises a ticket for a requester (§12.1 POST /tickets). */
function NewTicketDrawer({ open, onOpenChange, desks, details, onSearchPeople, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; desks: DeskSummary[]; details: DeskDetail[]; onSearchPeople: DeskTicketsScreenProps['onSearchPeople']; onCreate: DeskTicketsScreenProps['onCreate'] }) {
  const [deskId, setDeskId] = useState<string | null>(desks[0]?.id ?? null);
  const [people, setPeople] = useState<Person[]>([]);
  const [find, setFind] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const { busy, error, run } = useRun();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void onSearchPeople(find).then(setPeople).catch(() => setPeople([])), 250);
    return () => clearTimeout(t);
  }, [find, open, onSearchPeople]);
  const detail = details.find((d) => d.desk.id === deskId);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New ticket"
      subtitle="Raise a ticket for someone who called or walked up."
      size="lg"
      dirty={Boolean(subject || body)}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'create'}
            disabled={!deskId || !personId || !subject.trim() || !body.replace(/<[^>]*>/g, '').trim()}
            onClick={() => void run('create', () => onCreate({ deskId: deskId!, requesterPersonId: personId!, subject: subject.trim(), bodyHtml: body, categoryId: categoryId ?? undefined }))}
          >
            Raise ticket
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The ticket was not raised">{error}</InlineAlert>}
        {desks.length > 1 && (
          <FormField label="Desk" required>
            <Select value={deskId} onChange={setDeskId} options={desks.map((d) => ({ value: d.id, label: d.name }))} />
          </FormField>
        )}
        <FormField label="Find the requester" helper="Name or email">
          <TextField value={find} onChange={setFind} />
        </FormField>
        <FormField label="Requester" required>
          <Select value={personId} onChange={setPersonId} options={people.map((p) => ({ value: p.id, label: p.name, description: p.email ?? undefined }))} placeholder="Choose a person" emptyText="Nobody matches" />
        </FormField>
        {detail && (
          <FormField label="Category" optional>
            <Select value={categoryId} onChange={setCategoryId} clearable options={detail.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name, description: c.sensitive ? 'Sensitive' : undefined }))} />
          </FormField>
        )}
        <FormField label="Subject" required>
          <TextField value={subject} onChange={setSubject} maxLength={200} />
        </FormField>
        <FormField label="What they need" required>
          <RichTextEditor value={body} onChange={setBody} mergeFields={[]} />
        </FormField>
      </div>
    </Drawer>
  );
}
