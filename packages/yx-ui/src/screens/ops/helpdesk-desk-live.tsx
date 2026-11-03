// HLP-02 Agent desk, live (Helpdesk design wiring, round 2): the designed AgentDeskScreen in helpdesk.tsx renders this
// when the page passes `live`. The design's layout (header with facts, the missed-target banner, the ticket table with
// saved views, filters, bulk actions, row actions and the quick-view drawer) with the real tickets, plus the states the
// old agent screen had: the board, saved views, a new ticket for an employee, tags, scenarios and moving to another
// desk. The server decides who sees what (sensitive and private tickets only to their own team) and checks every action.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { KanbanBoard, type KanbanColumn } from '../../components/kanban';
import { RichTextEditor, STYLE_TOOLS } from '../../components/editor';
import { MenuItem } from '../../components/menu';
import { Dialog } from '../../components/overlay';
import { DescriptionList, PageHeader } from '../../components/shell';
import { PageBanner } from '../../components/notify';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { useRun } from '../org/org-kit';
import { OPEN_STATES, PRIORITY_LABEL, PriorityBadge, STATE_LABEL, StatusBadge, TicketFlags, when } from '../desk/desk-kit';
import type { DeskDetail, DeskSummary, LoadState, Person, SavedTicketView, SystemState, TicketFilters, TicketPage, TicketRow } from '../desk/types';
import { OpsDesk, SlaBadge, useSay } from './ops-kit';

export interface TicketQuery {
  viewId: string;
  filters: TicketFilters;
  layout: 'list' | 'board';
}

/** Built-in views (the design's names); saved views come from the server. */
export const BUILT_IN_VIEWS: { id: string; name: string; filters: TicketFilters }[] = [
  { id: 'mine', name: 'My open tickets', filters: { assignee: 'me', states: OPEN_STATES } },
  { id: 'unassigned', name: 'Unassigned', filters: { assignee: 'none', states: OPEN_STATES } },
  { id: 'breaching', name: 'At risk or breached', filters: { breaching: true, states: OPEN_STATES } },
  { id: 'waiting', name: 'Waiting on employee', filters: { states: ['pending'] } },
  { id: 'open', name: 'All open', filters: { states: OPEN_STATES } },
  { id: 'snoozed', name: 'Snoozed by me', filters: { snoozed: 'only' } },
  { id: 'all', name: 'All in my queues', filters: {} },
];

export type BulkAction = { assignee?: string | null; priority?: number; priorityReason?: string; addTags?: string[]; statusId?: string; scenarioId?: string };
export type BulkResult = { done: string[]; failed: { id: string; reason: string }[] };

export interface LiveAgentDesk {
  state: LoadState;
  onRetry: () => void;
  /** Every desk the person can see (names for moving); `myRole` marks the ones they are on. */
  desks: DeskSummary[];
  /** Set-up of the desks the person works on (statuses for the board and waiting, scenarios, categories). */
  details: DeskDetail[];
  views: SavedTicketView[];
  page: TicketPage | null;
  pageState: 'ready' | 'loading' | 'error';
  query: TicketQuery;
  onQueryChange: (q: TicketQuery) => void;
  /** The signed-in user (for "Assign to me" on one ticket). */
  meId: string | null;
  onOpen: (id: string) => void;
  onAssignToMe: (ticket: TicketRow) => Promise<unknown>;
  onMove: (ticket: TicketRow, statusId: string) => Promise<unknown>;
  onBulk: (ids: string[], action: BulkAction) => Promise<BulkResult>;
  onMoveDesk: (ticketId: string, deskId: string, reason: string) => Promise<unknown>;
  onSaveView: (name: string, shared: boolean, q: TicketQuery) => Promise<void>;
  onExport: (q: TicketQuery) => Promise<void>;
  onSearchPeople: (q: string) => Promise<Person[]>;
  onCreate: (input: { deskId: string; requesterPersonId: string; subject: string; bodyHtml: string; categoryId?: string }) => Promise<{ id: string }>;
  onLoadMore?: () => void;
  /** Stories and tests only: what is open or chosen on first render. */
  start?: { selected?: string[]; dialog?: 'tag' | 'priority' | 'move' | 'new'; openId?: string; bulkResult?: string };
}

const DONE: SystemState[] = ['solved', 'closed'];
const PRIORITY_TONE = (v: unknown) => (String(v).startsWith('P1') ? 'danger' : String(v).startsWith('P2') ? 'warning' : 'neutral');

const fromFilters = (f: TicketFilters): FilterValue[] => [
  ...(f.deskIds?.length ? [{ key: 'queue', type: 'multi' as const, values: f.deskIds }] : []),
  ...(f.priorities?.length ? [{ key: 'priority', type: 'multi' as const, values: f.priorities.map(String) }] : []),
  ...(f.states?.length ? [{ key: 'status', type: 'multi' as const, values: f.states }] : []),
  ...(f.createdFrom || f.createdTo ? [{ key: 'created', type: 'date' as const, from: f.createdFrom ?? null, to: f.createdTo ?? null }] : []),
];
/** The filter bar's values as the server's filters, on top of the view's own. */
export const toFilters = (base: TicketFilters, v: FilterValue[], search: string): TicketFilters => {
  const multi = (k: string) => (v.find((x) => x.key === k && x.type === 'multi') as { values: string[] } | undefined)?.values ?? [];
  const date = v.find((x) => x.key === 'created' && x.type === 'date') as { from: string | null; to: string | null } | undefined;
  return { ...base, deskIds: multi('queue'), priorities: multi('priority').map(Number), states: multi('status') as SystemState[], createdFrom: date?.from || undefined, createdTo: date?.to || undefined, search: search || undefined };
};

/** The design's columns with the real record. */
function columns(): TableColumn<TicketRow>[] {
  return [
    { key: 'id', header: 'Ticket', type: 'id', value: (t) => t.number, width: 110, hideable: false },
    {
      key: 'subject',
      header: 'Subject',
      value: (t) => t.subject,
      width: 320,
      render: (t) => (
        <span className="yx-ops-row">
          {(t.sensitive || t.private) && <Lock aria-label={t.private ? 'Private ticket' : 'Sensitive category'} size={14} />}
          <span>{t.subject}</span>
          <TicketFlags vip={t.vip} unverified={t.senderVerified === false} />
        </span>
      ),
    },
    { key: 'requester', header: 'Requester', type: 'person', value: (t) => t.requester ?? '', person: (t) => ({ name: t.requester ?? 'Someone', secondary: t.requestedFor ? `for ${t.requestedFor}` : undefined }), width: 200 },
    { key: 'queue', header: 'Queue', value: (t) => t.desk, groupable: true, width: 140 },
    { key: 'category', header: 'Category', value: (t) => t.category ?? '—', width: 140 },
    { key: 'priority', header: 'Priority', type: 'status', value: (t) => PRIORITY_LABEL[t.priority] ?? `P${t.priority}`, statusTone: PRIORITY_TONE, width: 120 },
    { key: 'status', header: 'Status', value: (t) => t.status, render: (t) => <StatusBadge label={t.status} state={t.systemState} />, width: 170 },
    {
      key: 'sla',
      header: 'Resolution SLA',
      value: (t) => (t.resolution ? t.resolution.targetMinutes - t.resolution.usedMinutes : Number.MAX_SAFE_INTEGER),
      render: (t) =>
        DONE.includes(t.systemState) ? (
          <Badge tone="success">Met</Badge>
        ) : t.resolution ? (
          <SlaBadge elapsedMin={t.resolution.usedMinutes} targetMin={t.resolution.targetMinutes} paused={t.resolution.paused} />
        ) : (
          <span className="yx-ops-muted">No target</span>
        ),
      width: 190,
    },
    { key: 'assignee', header: 'Assignee', value: (t) => t.assignee ?? 'Unassigned', width: 160 },
    { key: 'tags', header: 'Tags', value: (t) => t.tags.join(', '), width: 160, optional: true },
    { key: 'updated', header: 'Updated', value: (t) => t.updatedAt, render: (t) => when(t.updatedAt), width: 170, optional: true },
  ];
}

export function LiveAgentDesk({ live }: { live: LiveAgentDesk }) {
  const { query } = live;
  const [search, setSearch] = useState(query.filters.search ?? '');
  const [selected, setSelected] = useState<string[]>(live.start?.selected ?? []);
  const [openId, setOpenId] = useState<string | null>(live.start?.openId ?? null);
  const [dialog, setDialog] = useState<'tag' | 'priority' | 'move' | 'new' | null>(live.start?.dialog ?? null);
  const [bulkResult, setBulkResult] = useState<{ tone: 'info' | 'warning'; text: string } | null>(live.start?.bulkResult ? { tone: 'warning', text: live.start.bulkResult } : null);
  const { busy, error, run } = useRun();
  const { toast } = useSay();
  const firstQuery = useRef(query);
  useEffect(() => {
    if (query !== firstQuery.current) setSelected([]);
  }, [query]);
  const rows = live.page?.items ?? [];
  const mine = live.desks.filter((d) => d.myRole);
  const working = mine.filter((d) => d.canWork);
  const canWork = (t: TicketRow) => Boolean(live.desks.find((d) => d.id === t.deskId)?.canWork);
  const statusOf = (deskId: string, s: SystemState) => live.details.find((d) => d.desk.id === deskId)?.statuses.find((x) => x.active && x.systemState === s && !x.ticketTypeId);
  const lead = rows.some((r) => r.canBulk);
  const open = rows.find((t) => t.id === openId) ?? null;
  const breached = rows.filter((t) => t.sla?.breached && !DONE.includes(t.systemState)).length;
  const builtIn = BUILT_IN_VIEWS.find((v) => v.id === query.viewId);
  const saved = live.views.find((v) => v.id === query.viewId);
  const base = builtIn?.filters ?? saved?.filters ?? {};
  const setFilters = (v: FilterValue[], s = search) => live.onQueryChange({ ...query, filters: toFilters(base, v, s) });
  const pickView = (viewId: string) => {
    const v = BUILT_IN_VIEWS.find((x) => x.id === viewId) ?? live.views.find((x) => x.id === viewId);
    setSearch('');
    live.onQueryChange({ ...query, viewId, filters: v?.filters ?? {} });
  };
  const fields: FilterFieldDef[] = [
    ...(mine.length > 1 ? [{ key: 'queue', label: 'Queue', type: 'multi' as const, options: mine.map((d) => ({ value: d.id, label: d.name })) }] : []),
    { key: 'priority', label: 'Priority', type: 'multi', options: [1, 2, 3, 4].map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] })) },
    { key: 'status', label: 'Status', type: 'multi', options: (Object.keys(STATE_LABEL) as SystemState[]).map((s) => ({ value: s, label: STATE_LABEL[s] })) },
    { key: 'created', label: 'Raised', type: 'date' },
  ];
  const toolbar = <FilterBar fields={fields} value={fromFilters(query.filters)} onChange={(v) => setFilters(v)} search={search} onSearchChange={(s) => (setSearch(s), setFilters(fromFilters(query.filters), s))} searchPlaceholder="Search ticket, subject or person" />;
  const bulk = (action: BulkAction) =>
    void run('bulk', async () => {
      const r = await live.onBulk(selected, action);
      setSelected([]);
      if (r.failed.length) setBulkResult({ tone: 'warning', text: `${r.done.length} changed. ${r.failed.length} not changed: ${r.failed.map((f) => `${rows.find((x) => x.id === f.id)?.number ?? 'a ticket'}: ${f.reason}`).join('; ')}` });
      else {
        setBulkResult(null);
        toast({ tone: 'success', title: `${r.done.length} ${r.done.length === 1 ? 'ticket' : 'tickets'} changed.` });
      }
    });
  const assign = (t: TicketRow) =>
    void run(`assign:${t.id}`, async () => {
      await live.onAssignToMe(t);
      toast({ tone: 'success', title: `${t.number} is now yours.` });
    });
  const waiting = (t: TicketRow) => {
    const s = statusOf(t.deskId, 'pending');
    if (!s) return toast({ title: `${t.desk} has no "waiting" status. Add one in Desk set-up.` });
    void run(`wait:${t.id}`, async () => {
      await live.onMove(t, s.id);
      toast({ tone: 'success', title: `${t.number} is waiting on the employee. Its clock is paused.` });
    });
  };
  const chosen = rows.filter((r) => selected.includes(r.id));
  const oneDesk = chosen.length > 0 && chosen.every((r) => r.deskId === chosen[0].deskId) ? chosen[0].deskId : null;
  const scenarios = (oneDesk && live.details.find((d) => d.desk.id === oneDesk)?.scenarios.filter((s) => s.active)) || [];
  const targets = oneDesk ? (live.desks.find((d) => d.id === oneDesk)?.forwardTo ?? []).map((id) => live.desks.find((d) => d.id === id)).filter((d): d is DeskSummary => Boolean(d)) : [];

  const board: KanbanColumn[] = useMemo(
    () =>
      (['new', 'open', 'pending', 'on_hold', 'solved'] as SystemState[]).map((s) => ({
        id: s,
        title: STATE_LABEL[s],
        cards: rows.filter((t) => t.systemState === s).map((t) => ({ id: t.id, name: t.subject, facts: [`${t.number} · ${t.requester ?? ''}`, t.assignee ?? 'Unassigned'] as [string, string], daysInStage: Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86_400_000) })),
        emptyText: 'No tickets',
      })),
    [rows],
  );

  if (live.state === 'no-access')
    return (
      <OpsDesk area="helpdesk" active="Tickets">
        <PageHeader title="Tickets" />
        <NoAccessState what="the agent desk" grantedBy="your Service Desk admin" note="It lists the tickets of the desks you have a seat on." />
      </OpsDesk>
    );
  const tableState = live.state === 'loading' || live.state === 'error' ? live.state : live.pageState;

  return (
    <OpsDesk area="helpdesk" active="Tickets" counts={{ Tickets: live.page?.total ?? rows.length }}>
      <PageHeader
        title="Tickets"
        description={mine.length ? `Your queues: ${mine.map((d) => d.name).join(', ')}. Sensitive categories show only in their own queue.` : 'Tickets of the desks you are on.'}
        facts={`${live.page?.total ?? rows.length} in this view · ${breached} past the target`}
        actions={
          <>
            <Segment label="Show as" options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]} value={query.layout} onChange={(layout) => live.onQueryChange({ ...query, layout })} />
            {working.length > 0 && (
              <Button variant="primary" icon={Plus} onClick={() => setDialog('new')}>
                New ticket for an employee
              </Button>
            )}
          </>
        }
      />
      {breached > 0 && query.viewId !== 'breaching' && (
        <PageBanner tone="warning" action={<Button size="sm" onClick={() => pickView('breaching')}>Show breaching tickets</Button>}>
          {breached} {breached === 1 ? 'ticket has' : 'tickets have'} passed a response target.
        </PageBanner>
      )}
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      {bulkResult && <InlineAlert tone={bulkResult.tone} title="Some tickets were not changed">{bulkResult.text}</InlineAlert>}
      {query.layout === 'board' ? (
        <div className="yx-ops-stack">
          {toolbar}
          {rows.length === 0 ? (
            <EmptyState title="No tickets here." description="Change the view or filters to see more." />
          ) : (
            <KanbanBoard
              aria-label="Tickets by state"
              columns={board}
              noun="ticket"
              onOpenCard={setOpenId}
              onMove={(cardId, _from, to) => {
                const t = rows.find((r) => r.id === cardId);
                const s = t && statusOf(t.deskId, to as SystemState);
                if (t && s) void run('move', () => live.onMove(t, s.id));
                else if (t) toast({ title: `${t.desk} has no status for ${STATE_LABEL[to as SystemState].toLowerCase()}.` });
              }}
            />
          )}
        </div>
      ) : (
        <DataTable
          label="Tickets"
          columns={columns()}
          rows={rows}
          getRowId={(t) => t.id}
          state={tableState}
          onRetry={live.onRetry}
          errorTitle="We couldn't load tickets."
          empty={<EmptyState title="No tickets in your queues." description="New tickets appear here as soon as employees raise them." />}
          filtered={fromFilters(query.filters).length > 0 || Boolean(query.filters.search)}
          onClearFilters={() => {
            setSearch('');
            live.onQueryChange({ ...query, filters: base });
          }}
          selectable={lead}
          isSelectable={(t) => t.canBulk || 'Only a team lead of this desk changes many tickets at once'}
          selectedIds={selected}
          onSelectedChange={setSelected}
          bulkActions={(ids) => (
            <>
              <Button size="sm" loading={busy === 'bulk'} onClick={() => bulk({ assignee: 'me' })}>
                Assign {ids.length} to me
              </Button>
              <Button size="sm" onClick={() => setDialog('priority')}>
                Change priority
              </Button>
              <Button size="sm" onClick={() => (targets.length ? setDialog('move') : toast({ title: oneDesk ? 'This desk may not move tickets to another desk. Set it up in Desk set-up.' : 'Choose tickets of one desk to move them.' }))}>
                Move to queue
              </Button>
              <Button size="sm" onClick={() => setDialog('tag')}>
                Add a tag
              </Button>
              {scenarios.slice(0, 2).map((s) => (
                <Button key={s.id} size="sm" onClick={() => bulk({ scenarioId: s.id })}>
                  Run “{s.name}”
                </Button>
              ))}
            </>
          )}
          rowActions={(t) =>
            canWork(t) ? (
              <>
                {t.assigneeUserId !== live.meId && <MenuItem onSelect={() => assign(t)}>Assign to me</MenuItem>}
                {!DONE.includes(t.systemState) && t.systemState !== 'pending' && <MenuItem onSelect={() => waiting(t)}>Set waiting on employee</MenuItem>}
                <MenuItem onSelect={() => live.onOpen(t.id)}>Open ticket (reply, merge, resolve)</MenuItem>
              </>
            ) : (
              <MenuItem onSelect={() => live.onOpen(t.id)}>Open ticket</MenuItem>
            )
          }
          onRowClick={(t) => setOpenId(t.id)}
          activeRowId={openId}
          defaultSort={{ key: 'sla', dir: 'asc' }}
          toolbar={toolbar}
          views={
            <SavedViewMenu
              views={[...BUILT_IN_VIEWS.map((v) => ({ id: v.id, name: v.name, shared: true })), ...live.views.map((v) => ({ id: v.id, name: v.name, shared: v.shared }))]}
              currentId={query.viewId}
              onSelect={pickView}
              modified={JSON.stringify(query.filters) !== JSON.stringify(base)}
              onSaveAs={(name, shared) =>
                void run('view', async () => {
                  await live.onSaveView(name, shared, query);
                  toast({ tone: 'success', title: `View “${name}” saved.` });
                })
              }
            />
          }
          onExport={() => void run('export', () => live.onExport(query))}
          rowNoun={['ticket', 'tickets']}
        />
      )}
      {live.page?.nextCursor && live.onLoadMore && (
        <div className="yx-ops-row">
          <Button onClick={live.onLoadMore}>Show more ({live.page.total - rows.length} more)</Button>
        </div>
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open ? open.subject : ''}
        subtitle={open ? `${open.number} · ${open.desk}${open.category ? ` · ${open.category}` : ''}` : ''}
        meta={open ? <StatusBadge label={open.status} state={open.systemState} /> : null}
        footer={
          open && (
            <>
              {canWork(open) && open.assigneeUserId !== live.meId && (
                <Button loading={busy === `assign:${open.id}`} onClick={() => assign(open)}>
                  Assign to me
                </Button>
              )}
              <Button variant="primary" onClick={() => live.onOpen(open.id)}>
                Open ticket
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="yx-ops-stack">
            <PersonLabel name={open.requester ?? 'Someone'} secondary={open.requestedFor ? `for ${open.requestedFor}` : undefined} size={32} />
            <DescriptionList
              items={[
                { label: 'Priority', value: <PriorityBadge priority={open.priority} /> },
                { label: 'Assignee', value: open.assignee ?? 'Unassigned' },
                { label: 'Raised', value: `${formatDate(new Date(open.createdAt))}${open.channel ? ` via ${open.channel}` : ''}` },
                { label: 'First response', value: open.firstResponseAt ? <Badge tone="success">Met</Badge> : open.firstResponse ? <SlaBadge elapsedMin={open.firstResponse.usedMinutes} targetMin={open.firstResponse.targetMinutes} paused={open.firstResponse.paused} /> : 'No target' },
                { label: 'Resolution', value: DONE.includes(open.systemState) ? <Badge tone="success">Met</Badge> : open.resolution ? <SlaBadge elapsedMin={open.resolution.usedMinutes} targetMin={open.resolution.targetMinutes} paused={open.resolution.paused} /> : 'No target' },
                ...(open.tags.length ? [{ label: 'Tags', value: open.tags.join(', ') }] : []),
              ]}
            />
          </div>
        )}
      </Drawer>
      <TagDialog open={dialog === 'tag'} onOpenChange={(o) => setDialog(o ? 'tag' : null)} onSave={(tag) => bulk({ addTags: [tag] })} />
      <PriorityDialog open={dialog === 'priority'} count={selected.length} onOpenChange={(o) => setDialog(o ? 'priority' : null)} onSave={(priority, priorityReason) => bulk({ priority, priorityReason })} />
      <MoveDialog
        open={dialog === 'move'}
        count={selected.length}
        targets={targets}
        onOpenChange={(o) => setDialog(o ? 'move' : null)}
        onSave={(deskId, reason) =>
          void run('bulk', async () => {
            const failed: string[] = [];
            for (const id of selected) await live.onMoveDesk(id, deskId, reason).catch((e: Error) => failed.push(`${rows.find((x) => x.id === id)?.number}: ${e.message}`));
            const moved = selected.length - failed.length;
            setSelected([]);
            if (failed.length) setBulkResult({ tone: 'warning', text: `${moved} moved. ${failed.length} not moved: ${failed.join('; ')}` });
            else toast({ tone: 'success', title: `${moved} ${moved === 1 ? 'ticket' : 'tickets'} moved.` });
          })
        }
      />
      <NewTicketDrawer
        open={dialog === 'new'}
        onOpenChange={(o) => setDialog(o ? 'new' : null)}
        desks={working}
        details={live.details}
        onSearchPeople={live.onSearchPeople}
        onCreate={async (input) => {
          const r = await live.onCreate(input);
          setDialog(null);
          live.onOpen(r.id);
        }}
      />
    </OpsDesk>
  );
}

function TagDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (tag: string) => void }) {
  const [tag, setTag] = useState('');
  const ok = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u.test(tag.trim());
  const early = useTooEarly(ok ? [] : [{ fieldId: 'tag-name', message: 'Write a tag: letters, digits, spaces or dashes, up to 40.' }]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a tag"
      description="Letters, digits, spaces, dashes. Up to 40."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => !early.stop() && (onSave(tag.trim()), setTag(''), onOpenChange(false))}>
            Add tag
          </Button>
        </>
      }
    >
      <FormField id="tag-name" label="Tag" error={early.errorOf('tag-name')}>
        <TextField value={tag} onChange={setTag} maxLength={40} />
      </FormField>
    </Dialog>
  );
}

function PriorityDialog({ open, count, onOpenChange, onSave }: { open: boolean; count: number; onOpenChange: (o: boolean) => void; onSave: (priority: number, reason: string) => void }) {
  const [priority, setPriority] = useState('2');
  const [reason, setReason] = useState('');
  const early = useTooEarly(reason.trim().length >= 3 ? [] : [{ fieldId: 'prio-reason', message: 'Say why, in 3 letters or more.' }]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Change the priority of ${count} ${count === 1 ? 'ticket' : 'tickets'}`}
      description="The requesters' response targets change with it."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => !early.stop() && (onSave(Number(priority), reason.trim()), setReason(''), onOpenChange(false))}>
            Change priority
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        <FormField label="Priority">
          <Segment label="Priority" options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] }))} value={priority} onChange={setPriority} />
        </FormField>
        <FormField id="prio-reason" label="Why" required error={early.errorOf('prio-reason')}>
          <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
        </FormField>
      </div>
    </Dialog>
  );
}

function MoveDialog({ open, count, targets, onOpenChange, onSave }: { open: boolean; count: number; targets: DeskSummary[]; onOpenChange: (o: boolean) => void; onSave: (deskId: string, reason: string) => void }) {
  const [deskId, setDeskId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const early = useTooEarly([...(deskId ? [] : [{ fieldId: 'move-desk', message: 'Choose the desk.' }]), ...(reason.trim().length >= 3 ? [] : [{ fieldId: 'move-reason', message: 'Say why, in 3 letters or more.' }])]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Move ${count} ${count === 1 ? 'ticket' : 'tickets'} to another queue`}
      description="The other desk's team takes them over; the requesters are told."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => !early.stop() && (onSave(deskId!, reason.trim()), setReason(''), onOpenChange(false))}>
            Move
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        <FormField id="move-desk" label="To" required error={early.errorOf('move-desk')}>
          <Select value={deskId} onChange={setDeskId} options={targets.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a desk" />
        </FormField>
        <FormField id="move-reason" label="Why" required error={early.errorOf('move-reason')}>
          <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}

/** An agent raises a ticket for an employee who called or walked up (§12.1 POST /tickets). */
function NewTicketDrawer({ open, onOpenChange, desks, details, onSearchPeople, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; desks: DeskSummary[]; details: DeskDetail[]; onSearchPeople: LiveAgentDesk['onSearchPeople']; onCreate: (input: Parameters<LiveAgentDesk['onCreate']>[0]) => Promise<void> }) {
  const [deskId, setDeskId] = useState<string | null>(desks[0]?.id ?? null);
  const [people, setPeople] = useState<Person[]>([]);
  const [find, setFind] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const { busy, error, run } = useRun();
  const early = useTooEarly([
    ...(!deskId ? [{ fieldId: 'nt-desk', message: 'Choose the desk.' }] : []),
    ...(!personId ? [{ fieldId: 'nt-person', message: 'Choose who the ticket is for.' }] : []),
    ...(!subject.trim() ? [{ fieldId: 'nt-subject', message: 'Write a subject.' }] : []),
    ...(!body.replace(/<[^>]*>/g, '').trim() ? [{ fieldId: 'nt-body', message: 'Say what they need.' }] : []),
  ]);
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
      title="New ticket for an employee"
      subtitle="Raise a ticket for someone who called or walked up."
      size="lg"
      dirty={Boolean(subject || body)}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy === 'create'} onClick={() => !early.stop() && void run('create', () => onCreate({ deskId: deskId!, requesterPersonId: personId!, subject: subject.trim(), bodyHtml: body, categoryId: categoryId ?? undefined }))}>
            Raise ticket
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The ticket was not raised">{error}</InlineAlert>}
        {desks.length > 1 && (
          <FormField id="nt-desk" label="Desk" required error={early.errorOf('nt-desk')}>
            <Select value={deskId} onChange={setDeskId} options={desks.map((d) => ({ value: d.id, label: d.name }))} />
          </FormField>
        )}
        <FormField label="Find the employee" helper="Name or email">
          <TextField value={find} onChange={setFind} />
        </FormField>
        <FormField id="nt-person" label="Requester" required error={early.errorOf('nt-person')}>
          <Select value={personId} onChange={setPersonId} options={people.map((p) => ({ value: p.id, label: p.name, description: p.email ?? undefined }))} placeholder="Choose a person" emptyText="Nobody matches" />
        </FormField>
        {detail && (
          <FormField label="Category" optional>
            <Select value={categoryId} onChange={setCategoryId} clearable options={detail.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name, description: c.sensitive ? 'Sensitive' : undefined }))} />
          </FormField>
        )}
        <FormField id="nt-subject" label="Subject" required error={early.errorOf('nt-subject')}>
          <TextField value={subject} onChange={setSubject} maxLength={200} />
        </FormField>
        <FormField id="nt-body" label="What they need" required error={early.errorOf('nt-body')}>
          <RichTextEditor hide={STYLE_TOOLS} value={body} onChange={setBody} mergeFields={[]} />
        </FormField>
      </div>
    </Drawer>
  );
}
