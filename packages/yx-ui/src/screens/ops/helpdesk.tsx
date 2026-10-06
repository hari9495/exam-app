// Helpdesk screens (M08 §7): HLP-01 help centre, HLP-02 agent desk, HLP-03 ticket workspace, HLP-04 knowledge base editor,
// HLP-05 SLA dashboard, HLP-10 policy library + acknowledgement, HLP-11 policy admin.
import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, FileText, Lock, MessageSquare, Plus, Search, Send, Ticket as TicketIcon } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge, PersonLabel, Tag } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FormField, FieldRow } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { FileUpload } from '../../components/upload';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/menu';
import { AssistantPanel, PageBanner, type AssistantMessage } from '../../components/notify';
import { BottomSheet, Dialog } from '../../components/overlay';
import { BarChart, LineChart, StatCard } from '../../components/charts';
import { RichTextEditor } from '../../components/editor';
import { ActivityFeed, type ActivityEntry } from '../../components/timeline';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { Actions, CardGrid, Facts, OpsDesk, SlaBadge, Workspace } from './ops-kit';
import { ackPercent, slaState, ticketCloseInfo } from './ops-rules';
import type { KbArticle, PolicyRow, Ticket, TicketStatus } from './helpdesk-data';

export type ListState = 'ready' | 'loading' | 'error' | 'empty';
export type Device = 'desk' | 'phone';

const STATUS_TONE: Record<TicketStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  New: 'info',
  'In progress': 'neutral',
  'Waiting on employee': 'warning',
  Resolved: 'success',
  Closed: 'neutral',
  Reopened: 'warning',
};
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

/** YX-HD-04: articles suggested while typing — simple word match on title and summary. */
export function suggestArticles(articles: KbArticle[], text: string, max = 3): KbArticle[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (!words.length) return [];
  return articles
    .filter((a) => a.status !== 'Draft')
    .map((a) => ({ a, score: words.filter((w) => `${a.title} ${a.summary}`.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, max)
    .map((x) => x.a);
}

const CATEGORY_OPTIONS = [
  { value: 'payslip', label: 'Payslip query', description: 'Payroll team · private to payroll agents' },
  { value: 'leave', label: 'Leave and attendance', description: 'HR team' },
  { value: 'letters', label: 'Letters and documents', description: 'HR team' },
  { value: 'medical', label: 'Medical and insurance', description: 'HR team · private to HR agents' },
  { value: 'it', label: 'Laptop, access and network', description: 'IT team' },
  { value: 'facilities', label: 'Facilities and canteen', description: 'Admin team' },
  { value: 'expenses', label: 'Expenses and advances', description: 'Finance team' },
];

/* =========================================================================================
 * HLP-01 · Help centre (T8 / T2, D+M, Emp)
 * ======================================================================================= */

export interface RaiseTicketFormProps {
  articles: KbArticle[];
  defaultSubject?: string;
  defaultCategory?: string | null;
  onRaised?: (subject: string) => void;
  onDeflected?: (article: KbArticle) => void;
}
/** Raise-ticket form with live knowledge-base suggestions (YX-HD-04) and the private option (Q2). */
export function RaiseTicketForm({ articles, defaultSubject = '', defaultCategory = null, onDeflected }: RaiseTicketFormProps) {
  const [category, setCategory] = useState<string | null>(defaultCategory);
  const [subject, setSubject] = useState(defaultSubject);
  const [details, setDetails] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const suggestions = suggestArticles(articles, `${subject} ${details}`);
  const sensitive = category === 'payslip' || category === 'medical';
  return (
    <div className="yx-ops-stack">
      <FormField label="What is it about?" required>
        <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} placeholder="Choose a topic" />
      </FormField>
      <FormField label="Subject" required helper="One line, e.g. “LOP on my September payslip”">
        <TextField value={subject} onChange={setSubject} />
      </FormField>
      {suggestions.length > 0 && (
        <section className="yx-ops-stack" data-gap="sm" aria-live="polite" aria-label="Articles that may answer this">
          <p className="yx-ops-muted">These articles may answer your question</p>
          <ul className="yx-ops-list">
            {suggestions.map((a) => (
              <li key={a.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">{a.title}</span>
                  <span className="yx-ops-list__sub">{a.summary}</span>
                </span>
                <Button size="sm" onClick={() => onDeflected?.(a)}>
                  This answers it
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <FormField label="Details" helper="Add dates, amounts or screenshots so the team can help faster">
        <TextArea value={details} onChange={setDetails} rows={4} />
      </FormField>
      <FormField label="Attachments" optional>
        <FileUpload accept={['.pdf', '.jpg', '.png']} multiple upload={async () => {}} />
      </FormField>
      {sensitive ? (
        <InlineAlert tone="info" title="Private by default">
          Only the {category === 'payslip' ? 'payroll' : 'HR'} team's agents can see tickets in this topic.
        </InlineAlert>
      ) : (
        <Checkbox checked={isPrivate} onChange={setPrivate} label="Keep this private" description="Only the agent assigned and the queue lead can see it." />
      )}
    </div>
  );
}

export interface HelpCentreScreenProps {
  device?: Device;
  articles: KbArticle[];
  tickets: Ticket[];
  today: Date;
  state?: ListState;
  defaultQuery?: string;
  /** Opens the raise-ticket sheet. */
  raiseOpen?: boolean;
  raiseSubject?: string;
  /** Wave 5 assistant panel. */
  assistant?: AssistantMessage[];
  /** Ticket whose rating / reopen card is shown (resolved tickets). */
  rateTicketId?: string;
}
export function HelpCentreScreen({ device = 'desk', articles, tickets, today, state = 'ready', defaultQuery = '', raiseOpen, raiseSubject, assistant, rateTicketId }: HelpCentreScreenProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [open, setOpen] = useState(!!raiseOpen);
  const [deflected, setDeflected] = useState<string | null>(null);
  const results = query ? suggestArticles(articles, query, 5) : articles.filter((a) => a.status === 'Published').slice(0, 4);
  const rateTicket = tickets.find((t) => t.id === rateTicketId);
  const phone = device === 'phone';

  const search = (
    <div className="yx-ops-stack" data-gap="sm">
      <TextField value={query} onChange={setQuery} placeholder="Search help articles, e.g. payslip LOP" aria-label="Search help articles" prefix={<Search aria-hidden size={16} />} />
      <section aria-label={query ? 'Search results' : 'Popular articles'} className="yx-ops-stack" data-gap="sm">
        <p className="yx-ops-muted">{query ? `${results.length} ${results.length === 1 ? 'article' : 'articles'} for “${query}”` : 'Popular this month'}</p>
        {results.length === 0 ? (
          <EmptyState compact title="No articles match these words." description="Try other words, ask the assistant, or raise a ticket." />
        ) : (
          <ul className="yx-ops-list">
            {results.map((a) => (
              <li key={a.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <a href={`#${a.id}`} className="yx-ops-list__title">
                    {a.title}
                  </a>
                  <span className="yx-ops-list__sub">{a.summary}</span>
                </span>
                <Tag>{a.category}</Tag>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const myTickets =
    state === 'loading' ? (
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading your tickets">
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    ) : state === 'error' ? (
      <ErrorState title="We couldn't load your tickets." description="Check your connection and try again." onRetry={() => {}} reference="HD-LIST-5521" />
    ) : state === 'empty' || tickets.length === 0 ? (
      <EmptyState compact title="You have no tickets." description="When you raise a ticket, you can follow it and its response time here." />
    ) : (
      <ul className="yx-ops-stack yx-ops-plain" data-gap="sm" aria-label="My tickets">
        {tickets.map((t) => {
          const done = t.status === 'Resolved' || t.status === 'Closed';
          return (
            <li key={t.id} className="yx-ops-tile">
              <div className="yx-ops-tile__row">
                <span className="yx-ops-tile__title">{t.subject}</span>
                <TicketStatusBadge status={t.status} />
              </div>
              <div className="yx-ops-tile__row">
                <span className="yx-ops-muted">
                  <span className="yx-ops-mono">{t.id}</span> · {t.queue} team · raised {formatDate(t.createdAt)}
                </span>
                {!done && <SlaBadge label="Reply" elapsedMin={t.resolution.elapsed} targetMin={t.resolution.target} paused={t.status === 'Waiting on employee'} />}
                {t.private || t.sensitive ? (
                  <Badge tone="neutral">
                    <Lock aria-hidden size={12} /> Private
                  </Badge>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );

  const rating = rateTicket && <RateTicketCard ticket={rateTicket} today={today} resolvedOn={new Date(2026, 8, 27)} />;

  const deflectNote = deflected && (
    <InlineAlert tone="success" title="Glad that helped">
      We didn't raise a ticket. “{deflected}” is saved in your recent articles.
    </InlineAlert>
  );

  const form = (
    <RaiseTicketForm
      articles={articles}
      defaultSubject={raiseSubject}
      onDeflected={(a) => {
        setDeflected(a.title);
        setOpen(false);
      }}
    />
  );

  if (phone) {
    return (
      <PhoneFrame tab="me" title="Help" back={<IconButton icon={ArrowLeft} label="Back to Me" />}>
        {deflectNote}
        {search}
        <Button variant="primary" icon={Plus} fullWidth onClick={() => setOpen(true)}>
          Raise a ticket
        </Button>
        {rating}
        <h2 className="yx-ops-card__title">My tickets</h2>
        {myTickets}
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title="Raise a ticket"
          footer={
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Raise ticket
              </Button>
            </>
          }
        >
          {form}
        </BottomSheet>
      </PhoneFrame>
    );
  }

  return (
    <OpsDesk area="helpdesk" active="Help centre" member={false}>
      <PageHeader
        title="Help centre"
        description="Search answers, ask the assistant, or raise a ticket with the right team."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
            Raise a ticket
          </Button>
        }
      />
      {deflectNote}
      <Workspace
        main={
          <>
            <Card title="Find an answer">{search}</Card>
            {rating}
            <Card title="My tickets">{myTickets}</Card>
          </>
        }
        rail={
          assistant ? (
            <Card title="Ask the assistant">
              <p className="yx-ops-muted">Answers come from company policies and help articles. The assistant can't see other people's data.</p>
              <AssistantPanel messages={assistant} onSend={() => {}} />
            </Card>
          ) : (
            <Card title="Ask the assistant">
              <EmptyState compact title="The assistant arrives in wave 5." description="Until then, search articles or raise a ticket." />
            </Card>
          )
        }
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Raise a ticket"
        subtitle="We route it to the right team. You can follow it in My tickets."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Raise ticket
            </Button>
          </>
        }
      >
        {form}
      </Drawer>
    </OpsDesk>
  );
}

/** YX-HD-05: rating on close and reopen within 7 days. */
export function RateTicketCard({ ticket, today, resolvedOn }: { ticket: Ticket; today: Date; resolvedOn: Date }) {
  const info = ticketCloseInfo(resolvedOn, today);
  const [rating, setRating] = useState<string>('');
  const [sent, setSent] = useState(false);
  return (
    <Card title={`Resolved: ${ticket.subject}`}>
      <div className="yx-ops-stack">
        <p className="yx-ops-muted">
          {info.closed ? `Closed on ${formatDate(info.closesOn)}.` : `Closes on ${formatDate(info.closesOn)} if you don't reply.`} {info.canReopen ? `You can reopen it until ${formatDate(info.reopenUntil)}.` : 'It can no longer be reopened; raise a new ticket.'}
        </p>
        {sent ? (
          <InlineAlert tone="success">Thanks. Your rating is saved.</InlineAlert>
        ) : (
          <FormField label="How was the help you got?">
            <RadioGroup
              orientation="horizontal"
              value={rating}
              onChange={setRating}
              options={[
                { value: '1', label: '1 Poor' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
                { value: '5', label: '5 Very good' },
              ]}
            />
          </FormField>
        )}
        <Actions>
          {!sent && (
            <Button disabled={!rating} onClick={() => setSent(true)}>
              Send rating
            </Button>
          )}
          {info.canReopen && <Button>Reopen ticket</Button>}
        </Actions>
      </div>
    </Card>
  );
}

/* =========================================================================================
 * HLP-02 · Agent desk (T2, Agt)
 * ======================================================================================= */

const DESK_FILTERS: FilterFieldDef[] = [
  { key: 'queue', label: 'Queue', type: 'multi', options: ['HR', 'Payroll', 'IT', 'Admin', 'Finance'].map((v) => ({ value: v, label: v })) },
  { key: 'priority', label: 'Priority', type: 'multi', options: ['Urgent', 'High', 'Normal', 'Low'].map((v) => ({ value: v, label: v })) },
  { key: 'status', label: 'Status', type: 'multi', options: ['New', 'In progress', 'Waiting on employee', 'Resolved', 'Reopened'].map((v) => ({ value: v, label: v })) },
  { key: 'created', label: 'Raised', type: 'date' },
];

export function ticketColumns(): TableColumn<Ticket>[] {
  return [
    { key: 'id', header: 'Ticket', type: 'id', value: (t) => t.id, width: 110 },
    {
      key: 'subject',
      header: 'Subject',
      value: (t) => t.subject,
      width: 320,
      render: (t) => (
        <span className="yx-ops-row">
          {(t.sensitive || t.private) && <Lock aria-label={t.private ? 'Private ticket' : 'Sensitive category'} size={14} />}
          <span>{t.subject}</span>
        </span>
      ),
    },
    { key: 'requester', header: 'Requester', type: 'person', value: (t) => t.requester, person: (t) => ({ name: t.requester, secondary: t.requesterRole }), width: 200 },
    { key: 'queue', header: 'Queue', value: (t) => t.queue, groupable: true, width: 90 },
    { key: 'category', header: 'Category', value: (t) => t.category, width: 140 },
    { key: 'priority', header: 'Priority', type: 'status', value: (t) => t.priority, statusTone: (v) => (v === 'Urgent' ? 'danger' : v === 'High' ? 'warning' : 'neutral'), width: 100 },
    { key: 'status', header: 'Status', type: 'status', value: (t) => t.status, statusTone: (v) => STATUS_TONE[v as TicketStatus], width: 170 },
    {
      key: 'sla',
      header: 'Resolution SLA',
      value: (t) => t.resolution.target - t.resolution.elapsed,
      render: (t) =>
        t.status === 'Resolved' || t.status === 'Closed' ? (
          <Badge tone="success">Met</Badge>
        ) : (
          <SlaBadge elapsedMin={t.resolution.elapsed} targetMin={t.resolution.target} paused={t.status === 'Waiting on employee'} />
        ),
      width: 190,
    },
    { key: 'assignee', header: 'Assignee', value: (t) => t.assignee ?? 'Unassigned', width: 160 },
  ];
}

export interface AgentDeskScreenProps {
  tickets: Ticket[];
  state?: ListState;
  view?: string;
  defaultFilters?: FilterValue[];
  /** Ticket opened in the quick-view drawer. */
  openTicketId?: string | null;
  defaultSelected?: string[];
  /** The agent's own queues: sensitive tickets from other queues are never listed (YX-HD-03). */
  myQueues?: Ticket['queue'][];
}
export function AgentDeskScreen({ tickets, state = 'ready', view = 'open', defaultFilters = [], openTicketId = null, defaultSelected = [], myQueues }: AgentDeskScreenProps) {
  const [filters, setFilters] = useState<FilterValue[]>(defaultFilters);
  const [search, setSearch] = useState('');
  const [viewId, setViewId] = useState(view);
  const [openId, setOpenId] = useState<string | null>(openTicketId);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const visible = useMemo(() => {
    let rows = tickets.filter((t) => !myQueues || myQueues.includes(t.queue) || !t.sensitive);
    if (viewId === 'open') rows = rows.filter((t) => t.status !== 'Closed' && t.status !== 'Resolved');
    if (viewId === 'unassigned') rows = rows.filter((t) => !t.assignee);
    if (viewId === 'risk') rows = rows.filter((t) => ['at-risk', 'breached'].includes(slaState(t.resolution.elapsed, t.resolution.target, { paused: t.status === 'Waiting on employee' })));
    if (viewId === 'waiting') rows = rows.filter((t) => t.status === 'Waiting on employee');
    for (const f of filters) if (f.type === 'multi' && f.values.length) rows = rows.filter((t) => f.values.includes(String((t as unknown as Record<string, unknown>)[f.key])));
    if (search) rows = rows.filter((t) => `${t.id} ${t.subject} ${t.requester}`.toLowerCase().includes(search.toLowerCase()));
    return rows;
  }, [tickets, viewId, filters, search, myQueues]);
  const open = tickets.find((t) => t.id === openId);
  const breaching = tickets.filter((t) => slaState(t.resolution.elapsed, t.resolution.target, { paused: t.status === 'Waiting on employee' }) === 'breached' && t.status !== 'Closed' && t.status !== 'Resolved').length;

  return (
    <OpsDesk area="helpdesk" active="Tickets" counts={{ Tickets: visible.length }}>
      <PageHeader
        title="Tickets"
        description="Your queues: HR, Payroll and Admin. Sensitive categories show only in their own queue."
        facts={`${tickets.filter((t) => t.status !== 'Closed').length} open · ${breaching} breached · first response target 4 business hours`}
        actions={<Button icon={Plus}>New ticket for an employee</Button>}
      />
      {breaching > 0 && (
        <PageBanner tone="warning" action={<Button size="sm" onClick={() => setViewId('risk')}>Show breaching tickets</Button>}>
          {breaching} {breaching === 1 ? 'ticket has' : 'tickets have'} passed the resolution target. The queue lead has been told.
        </PageBanner>
      )}
      <DataTable
        label="Tickets"
        columns={ticketColumns()}
        rows={state === 'empty' ? [] : visible}
        getRowId={(t) => t.id}
        state={state === 'empty' ? 'ready' : state}
        errorTitle="We couldn't load tickets."
        errorReference="HD-DESK-2041"
        onRetry={() => {}}
        empty={<EmptyState title="No tickets in your queues." description="New tickets appear here as soon as employees raise them." />}
        filtered={filters.length > 0 || !!search}
        onClearFilters={() => {
          setFilters([]);
          setSearch('');
        }}
        selectable
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={(ids) => (
          <>
            <Button size="sm">Assign {ids.length} to me</Button>
            <Button size="sm">Change priority</Button>
            <Button size="sm">Move to queue</Button>
          </>
        )}
        rowActions={() => (
          <>
            <MenuItem>Assign to me</MenuItem>
            <MenuItem>Set waiting on employee</MenuItem>
            <MenuItem>Merge into another ticket</MenuItem>
          </>
        )}
        onRowClick={(t) => setOpenId(t.id)}
        activeRowId={openId}
        defaultSort={{ key: 'sla', dir: 'asc' }}
        toolbar={<FilterBar fields={DESK_FILTERS} value={filters} onChange={setFilters} search={search} onSearchChange={setSearch} searchPlaceholder="Search ticket, subject or person" />}
        views={
          <SavedViewMenu
            views={[
              { id: 'open', name: 'My open tickets' },
              { id: 'unassigned', name: 'Unassigned', shared: true },
              { id: 'risk', name: 'At risk or breached', shared: true },
              { id: 'waiting', name: 'Waiting on employee' },
              { id: 'all', name: 'All in my queues' },
            ]}
            currentId={viewId}
            onSelect={setViewId}
            modified={filters.length > 0}
          />
        }
        onExport={() => {}}
        pageSize={25}
      />
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open ? open.subject : ''}
        subtitle={open ? `${open.id} · ${open.queue} · ${open.category}` : ''}
        meta={open ? <TicketStatusBadge status={open.status} /> : null}
        footer={
          <>
            <Button>Assign to me</Button>
            <Button variant="primary">Open ticket</Button>
          </>
        }
      >
        {open && (
          <div className="yx-ops-stack">
            <PersonLabel name={open.requester} secondary={open.requesterRole} size={32} />
            <DescriptionList
              items={[
                { label: 'Priority', value: open.priority },
                { label: 'Assignee', value: open.assignee ?? 'Unassigned' },
                { label: 'Raised', value: `${formatDate(open.createdAt)} via ${open.channel}` },
                { label: 'First response', value: <SlaBadge elapsedMin={open.firstResponse.elapsed} targetMin={open.firstResponse.target} met={open.firstResponse.met} /> },
                { label: 'Resolution', value: <SlaBadge elapsedMin={open.resolution.elapsed} targetMin={open.resolution.target} paused={open.status === 'Waiting on employee'} /> },
              ]}
            />
          </div>
        )}
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-03 · Ticket workspace (T3, Agt)
 * ======================================================================================= */

export interface TicketMessage {
  id: string;
  kind: 'employee' | 'agent' | 'note' | 'system';
  who: string;
  at: Date;
  text: string;
}
export interface TicketWorkspaceScreenProps {
  ticket: Ticket;
  messages: TicketMessage[];
  macros: { id: string; name: string; body: string }[];
  articles: KbArticle[];
  activity: ActivityEntry[];
  today: Date;
  /** Composer mode on first render. */
  defaultMode?: 'reply' | 'note';
  defaultDraft?: string;
  /** Shows the "resolved" state with the employee's rating. */
  resolved?: boolean;
}
export function TicketWorkspaceScreen({ ticket, messages, macros, articles, activity, today, defaultMode = 'reply', defaultDraft = '', resolved }: TicketWorkspaceScreenProps) {
  const [mode, setMode] = useState(defaultMode);
  const [draft, setDraft] = useState(defaultDraft);
  const [thread, setThread] = useState(messages);
  const [status, setStatus] = useState<TicketStatus>(resolved ? 'Resolved' : ticket.status);
  const first = ticket.requester.split(' ')[0];
  const send = () => {
    if (!draft.trim()) return;
    setThread((t) => [...t, { id: `n${t.length}`, kind: mode === 'note' ? 'note' : 'agent', who: 'Suresh Pillai', at: today, text: draft }]);
    setDraft('');
  };
  const related = suggestArticles(articles, ticket.subject, 2);
  const paused = status === 'Waiting on employee';
  return (
    <OpsDesk area="helpdesk" active="Tickets">
      <ObjectHeader
        name={ticket.subject}
        icon={TicketIcon}
        secondary={
          <span>
            <span className="yx-ops-mono">{ticket.id}</span> · {ticket.queue} queue · {ticket.category} · raised {formatDate(ticket.createdAt)} via {ticket.channel}
          </span>
        }
        status={
          <>
            <TicketStatusBadge status={status} />
            {ticket.sensitive && (
              <Badge tone="neutral">
                <Lock aria-hidden size={12} /> Sensitive: payroll agents only
              </Badge>
            )}
            {status !== 'Resolved' && <SlaBadge label="Resolution" elapsedMin={ticket.resolution.elapsed} targetMin={ticket.resolution.target} paused={paused} />}
          </>
        }
        actions={
          <>
            <Button onClick={() => setStatus(paused ? 'In progress' : 'Waiting on employee')}>{paused ? 'Resume' : 'Wait on employee'}</Button>
            <Button onClick={() => setStatus('Resolved')} disabled={status === 'Resolved'}>
              Resolve
            </Button>
          </>
        }
        menu={
          <>
            <MenuItem>Change queue</MenuItem>
            <MenuItem>Merge into another ticket</MenuItem>
            <MenuItem>Convert to a case</MenuItem>
          </>
        }
      />
      {paused && <InlineAlert tone="info">The SLA clock is paused while you wait for {first}. It restarts when they reply.</InlineAlert>}
      {status === 'Resolved' && (
        <InlineAlert tone="success" title="Resolved">
          Closes on {formatDate(ticketCloseInfo(today, today).closesOn)} if {first} doesn't reply. {first} rated this ticket 5 of 5.
        </InlineAlert>
      )}
      <Workspace
        main={
          <>
            <Card title="Conversation">
              <ol className="yx-ops-conv" aria-label="Conversation">
                {thread.map((m) => (
                  <li key={m.id} className="yx-ops-msg" data-kind={m.kind === 'note' ? 'note' : m.kind === 'agent' ? 'mine' : undefined}>
                    <span className="yx-ops-msg__meta">
                      <span className="yx-ops-msg__who">{m.who}</span>
                      {m.kind === 'note' && <Badge tone="warning">Internal note, not visible to {first}</Badge>}
                      <span>
                        {formatDate(m.at)}, {m.at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </span>
                    </span>
                    <p className="yx-ops-msg__body">{m.text}</p>
                  </li>
                ))}
              </ol>
            </Card>
            <Card title="Respond">
              <Tabs value={mode} onValueChange={(v) => setMode(v as 'reply' | 'note')}>
                <TabsList aria-label="Response type">
                  <TabsTrigger value="reply">Reply to {first}</TabsTrigger>
                  <TabsTrigger value="note">Internal note</TabsTrigger>
                </TabsList>
                <TabsContent value={mode}>
                  <div className="yx-ops-stack">
                    {mode === 'note' && <p className="yx-ops-muted">Only agents in the {ticket.queue} queue see internal notes.</p>}
                    <FormField label={mode === 'note' ? 'Note' : 'Reply'} hideLabel>
                      <TextArea value={draft} onChange={setDraft} rows={5} placeholder={mode === 'note' ? 'Add a note for other agents' : `Write to ${first}`} />
                    </FormField>
                    <Actions>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button icon={MessageSquare}>Insert saved reply</Button>
                        </MenuTrigger>
                        <MenuContent>
                          {macros.map((m) => (
                            <MenuItem key={m.id} onSelect={() => setDraft(m.body.replace('{first_name}', first))}>
                              {m.name}
                            </MenuItem>
                          ))}
                        </MenuContent>
                      </Menu>
                      <Button variant="primary" icon={Send} onClick={send} disabled={!draft.trim()}>
                        {mode === 'note' ? 'Add note' : 'Send reply'}
                      </Button>
                    </Actions>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </>
        }
        rail={
          <>
            <Card title="Requester">
              <PersonLabel name={ticket.requester} secondary={ticket.requesterRole} size={32} />
            </Card>
            <Card title="Details">
              <DescriptionList
                items={[
                  { label: 'Queue', value: ticket.queue },
                  { label: 'Category', value: ticket.category },
                  { label: 'Priority', value: ticket.priority },
                  { label: 'Assignee', value: ticket.assignee ?? 'Unassigned' },
                  { label: 'First response', value: <SlaBadge elapsedMin={ticket.firstResponse.elapsed} targetMin={ticket.firstResponse.target} met={ticket.firstResponse.met} /> },
                ]}
              />
            </Card>
            <Card title="Related articles">
              {related.length ? (
                <ul className="yx-ops-list">
                  {related.map((a) => (
                    <li key={a.id} className="yx-ops-list__item">
                      <span className="yx-ops-list__main">
                        <span className="yx-ops-list__title">{a.title}</span>
                      </span>
                      <Button size="sm" onClick={() => setDraft((d) => `${d}${d ? '\n' : ''}This article explains it: ${a.title} (${a.id})`)}>
                        Add link
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="yx-ops-muted">No related articles.</p>
              )}
            </Card>
            <Card title="Activity">
              <ActivityFeed entries={activity} today={today} />
            </Card>
          </>
        }
      />
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-04 · Knowledge base editor (T3, Agt, HR)
 * ======================================================================================= */

export interface KbEditorScreenProps {
  article: KbArticle;
  html: string;
  versions: { v: string; at: Date; by: string; note: string }[];
  mode?: 'draft' | 'published' | 'review-due';
  today: Date;
}
export function KbEditorScreen({ article, html, versions, mode = 'draft', today }: KbEditorScreenProps) {
  const [title, setTitle] = useState(article.title);
  const [cats, setCats] = useState<string[]>([article.category.toLowerCase()]);
  const [audience, setAudience] = useState<string[]>(['all']);
  const [keywords, setKeywords] = useState('LOP, loss of pay, payslip deduction');
  const [publishOpen, setPublishOpen] = useState(false);
  return (
    <OpsDesk area="helpdesk" active="Knowledge base">
      <ObjectHeader
        name={title || 'Untitled article'}
        icon={BookOpen}
        secondary={
          <span>
            <span className="yx-ops-mono">{article.id}</span> · by {article.author} · updated {formatDate(article.updated)}
          </span>
        }
        status={mode === 'published' ? <Badge tone="success">Published</Badge> : mode === 'review-due' ? <Badge tone="warning">Review due</Badge> : <Badge tone="neutral">Draft</Badge>}
        actions={
          <>
            <Button>Preview as employee</Button>
            <Button>Save draft</Button>
            <Button variant="primary" onClick={() => setPublishOpen(true)}>
              {mode === 'published' ? 'Publish changes' : 'Publish'}
            </Button>
          </>
        }
      />
      {mode === 'review-due' && <PageBanner tone="warning">This article was last reviewed over 5 months ago. Check it still matches the current policy, then publish or mark reviewed.</PageBanner>}
      <Workspace
        main={
          <Card>
            <div className="yx-ops-stack">
              <FormField label="Title" required>
                <TextField value={title} onChange={setTitle} />
              </FormField>
              <FormField label="Answer" required helper="Write the steps in plain words. Link to the policy instead of copying it.">
                <RichTextEditor defaultValue={html} mergeFields={[]} />
              </FormField>
            </div>
          </Card>
        }
        rail={
          <>
            <Card title="Where it shows">
              <div className="yx-ops-stack">
                <FormField label="Categories">
                  <MultiSelect
                    value={cats}
                    onChange={setCats}
                    options={[
                      { value: 'payroll', label: 'Payroll' },
                      { value: 'attendance', label: 'Attendance' },
                      { value: 'tax', label: 'Tax' },
                      { value: 'letters', label: 'Letters' },
                      { value: 'expenses', label: 'Expenses' },
                      { value: 'it', label: 'IT' },
                    ]}
                  />
                </FormField>
                <FormField label="Audience" helper="People outside the audience never see it, and the assistant won't use it for them.">
                  <MultiSelect
                    value={audience}
                    onChange={setAudience}
                    options={[
                      { value: 'all', label: 'Everyone at Kaveri Foods' },
                      { value: 'hosur', label: 'Hosur plant' },
                      { value: 'tn', label: 'Tamil Nadu entity' },
                      { value: 'managers', label: 'People managers' },
                    ]}
                  />
                </FormField>
                <FormField label="Also suggest for these words" helper="Separate with commas">
                  <TextField value={keywords} onChange={setKeywords} />
                </FormField>
                <Switch defaultChecked label="Use in assistant answers" description="Private and sensitive tickets are never used as content." />
              </div>
            </Card>
            <Card title="How it's doing">
              <Facts
                items={[
                  { label: 'Views, 90 days', value: article.views.toLocaleString('en-IN') },
                  { label: 'Answered without a ticket', value: article.deflected.toLocaleString('en-IN') },
                ]}
              />
            </Card>
            <Card title="Versions">
              <ul className="yx-ops-list">
                {versions.map((v) => (
                  <li key={v.v} className="yx-ops-list__item">
                    <span className="yx-ops-list__main">
                      <span className="yx-ops-list__title">
                        {v.v} · {formatDate(v.at)}
                      </span>
                      <span className="yx-ops-list__sub">
                        {v.by}: {v.note}
                      </span>
                    </span>
                    <Button size="sm">Compare</Button>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        }
      />
      <Dialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={`Publish “${title}”?`}
        description={`It will be suggested to ${audience.includes('all') ? 'everyone' : 'the chosen audience'} from ${formatDate(today)}, and the assistant can quote it.`}
        footer={
          <>
            <Button onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setPublishOpen(false)}>
              Publish article
            </Button>
          </>
        }
      />
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-05 · SLA dashboard (T6, QL)
 * ======================================================================================= */

export interface SlaDashboardScreenProps {
  tickets: Ticket[];
  loading?: boolean;
  empty?: boolean;
}
export function SlaDashboardScreen({ tickets, loading, empty }: SlaDashboardScreenProps) {
  const [period, setPeriod] = useState<string | null>('30');
  const open = tickets.filter((t) => t.status !== 'Closed' && t.status !== 'Resolved');
  const states = open.map((t) => slaState(t.resolution.elapsed, t.resolution.target, { paused: t.status === 'Waiting on employee' }));
  const breached = states.filter((s) => s === 'breached').length;
  const risk = states.filter((s) => s === 'at-risk').length;
  const queues = ['HR', 'Payroll', 'IT', 'Admin', 'Finance'];
  const atRisk = open.filter((t) => ['at-risk', 'breached'].includes(slaState(t.resolution.elapsed, t.resolution.target, { paused: t.status === 'Waiting on employee' })));
  return (
    <OpsDesk area="helpdesk" active="SLAs">
      <PageHeader
        title="SLAs"
        description="Response and resolution against targets, by queue. Targets use each queue's business hours and pause while waiting on the employee."
        actions={
          <>
            <Select
              aria-label="Period"
              size="sm"
              value={period}
              onChange={setPeriod}
              options={[
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: '90', label: 'Last 90 days' },
              ]}
            />
            <Button>Export</Button>
          </>
        }
      />
      {empty ? (
        <EmptyState title="No tickets in this period." description="SLA figures appear once your queues receive tickets." />
      ) : (
        <>
          <CardGrid min="sm">
            <StatCard label="Open tickets" value={open.length} previous={9} previousLabel="last month" trend={[11, 9, 12, 10, 8, open.length]} drill={{ label: `View ${open.length} open tickets`, href: '#tickets' }} loading={loading} />
            <StatCard label="Breached now" value={breached} previous={3} previousLabel="last month" drill={{ label: 'View breached tickets', href: '#breached' }} loading={loading} />
            <StatCard label="First response met" value={94} unit="%" previous={89} previousLabel="last month" trend={[86, 88, 89, 91, 92, 94]} drill={{ label: 'View first responses', href: '#fr' }} loading={loading} />
            <StatCard label="Answered by an article" value={31} unit="%" previous={24} previousLabel="last month" trend={[18, 20, 24, 27, 29, 31]} drill={{ label: 'View deflected searches', href: '#kb' }} loading={loading} />
          </CardGrid>
          <CardGrid min="lg">
            <BarChart title="Resolution breaches by queue" xLabel="Queue" categories={queues} series={[{ name: 'Breached', values: [2, 4, 1, 3, 1] }, { name: 'Met', values: [48, 61, 72, 30, 22] }]} stacked emphasis="Breached" loading={loading} />
            <LineChart title="Resolution target met, weekly" xLabel="Week" categories={['31 Aug', '7 Sep', '14 Sep', '21 Sep', '28 Sep']} series={[{ name: 'Met %', values: [88, 90, 86, 91, 93] }]} target={{ value: 90, label: 'Target 90%' }} yMin={70} loading={loading} />
          </CardGrid>
          <Card title={`At risk or breached (${atRisk.length})`}>
            <DataTable label="At risk or breached tickets" columns={ticketColumns().filter((c) => ['id', 'subject', 'queue', 'sla', 'assignee'].includes(c.key))} rows={atRisk} getRowId={(t) => t.id} state={loading ? 'loading' : 'ready'} empty={<EmptyState compact title="Nothing at risk right now." />} rowButtons={() => <Button size="sm">Reassign</Button>} />
          </Card>
          <Card title="Agent load">
            <DataTable
              label="Agent load"
              columns={[
                { key: 'agent', header: 'Agent', type: 'person', value: (r: AgentLoad) => r.agent, person: (r) => ({ name: r.agent, secondary: r.queue }) },
                { key: 'open', header: 'Open', type: 'number', value: (r) => r.open },
                { key: 'risk', header: 'At risk', type: 'number', value: (r) => r.risk },
                { key: 'csat', header: 'Rating (of 5)', type: 'number', value: (r) => r.csat },
              ]}
              rows={AGENT_LOAD}
              getRowId={(r) => r.agent}
              state={loading ? 'loading' : 'ready'}
            />
          </Card>
        </>
      )}
    </OpsDesk>
  );
}
interface AgentLoad {
  agent: string;
  queue: string;
  open: number;
  risk: number;
  csat: number;
}
const AGENT_LOAD: AgentLoad[] = [
  { agent: 'Suresh Pillai', queue: 'Payroll', open: 7, risk: 2, csat: 4.6 },
  { agent: 'Lakshmi Venkatesan', queue: 'HR', open: 9, risk: 1, csat: 4.8 },
  { agent: 'Joseph Mathew', queue: 'IT', open: 12, risk: 0, csat: 4.4 },
  { agent: 'Farhan Qureshi', queue: 'Admin', open: 5, risk: 1, csat: 4.1 },
  { agent: 'Anita Desai', queue: 'Finance', open: 4, risk: 1, csat: 4.5 },
];

/* =========================================================================================
 * HLP-10 · Policy library + acknowledgement (T2 / T4, D+M, Emp)
 * ======================================================================================= */

const MY_POLICY_TONE = { Pending: 'warning', Overdue: 'danger', Acknowledged: 'success', 'Not required': 'neutral' } as const;

export interface PolicyAckProps {
  policy: PolicyRow;
  today: Date;
  /** Show the done state. */
  done?: boolean;
  /** OTP sent (critical policies, P05 click-to-accept evidence). */
  otpSent?: boolean;
  quizAnswers?: Record<string, string>;
}
const QUIZ = [
  { id: 'q1', q: 'Within how long of an incident can a complaint be filed with the Internal Committee?', options: ['1 month', '3 months, extendable by 3 more', '1 year'], answer: '3 months, extendable by 3 more' },
  { id: 'q2', q: 'Who can see a POSH complaint?', options: ['Your manager and HR', 'Only the Internal Committee members on the case', 'Anyone in HR'], answer: 'Only the Internal Committee members on the case' },
];
/** Pass mark for the policy quiz (M07). */
export function quizScore(answers: Record<string, string>): { correct: number; total: number; passed: boolean } {
  const correct = QUIZ.filter((q) => answers[q.id] === q.answer).length;
  return { correct, total: QUIZ.length, passed: correct === QUIZ.length };
}
/** The acknowledgement step: click, OTP for critical policies, or quiz (YX-POL-02). */
export function PolicyAcknowledge({ policy, today, done, otpSent, quizAnswers = {} }: PolicyAckProps) {
  const [read, setRead] = useState(false);
  const [sent, setSent] = useState(!!otpSent);
  const [otp, setOtp] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>(quizAnswers);
  const [complete, setComplete] = useState(!!done);
  const score = quizScore(answers);
  if (complete || policy.myStatus === 'Acknowledged')
    return (
      <InlineAlert tone="success" title="Acknowledged">
        You acknowledged {policy.version} on {formatDate(policy.acknowledgedOn ?? today)} by {policy.method === 'OTP' ? 'one-time code' : policy.method === 'Quiz' ? 'quiz' : 'confirmation'}. The record keeps the version and time.
      </InlineAlert>
    );
  return (
    <section className="yx-ops-stack" aria-label="Acknowledge this policy">
      {policy.method === 'Quiz' && (
        <div className="yx-ops-stack">
          <p className="yx-ops-muted">Answer both questions correctly to acknowledge. You can try again.</p>
          {QUIZ.map((q) => (
            <FormField key={q.id} label={q.q}>
              <RadioGroup value={answers[q.id] ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} options={q.options.map((o) => ({ value: o, label: o }))} />
            </FormField>
          ))}
          {Object.keys(answers).length === QUIZ.length && !score.passed && (
            <InlineAlert tone="warning">
              {score.correct} of {score.total} correct. Read the highlighted section again and change your answer.
            </InlineAlert>
          )}
        </div>
      )}
      <Checkbox checked={read} onChange={setRead} label={`I have read and understood the ${policy.title} (${policy.version})`} />
      {policy.method === 'OTP' && sent && (
        <FormField label="One-time code" helper="Sent by SMS to your mobile ending 4471. It expires in 10 minutes.">
          <TextField value={otp} onChange={setOtp} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
        </FormField>
      )}
      <Actions>
        {policy.method === 'OTP' && !sent ? (
          <Button variant="primary" disabled={!read} onClick={() => setSent(true)}>
            Send code to acknowledge
          </Button>
        ) : (
          <Button variant="primary" disabled={!read || (policy.method === 'OTP' && otp.length !== 6) || (policy.method === 'Quiz' && !score.passed)} onClick={() => setComplete(true)}>
            Acknowledge
          </Button>
        )}
      </Actions>
    </section>
  );
}

export interface PolicyLibraryScreenProps {
  device?: Device;
  policies: PolicyRow[];
  today: Date;
  state?: ListState;
  /** Policy open in the reader. */
  openId?: string | null;
  otpSent?: boolean;
  done?: boolean;
  quizAnswers?: Record<string, string>;
}
export function PolicyLibraryScreen({ device = 'desk', policies, today, state = 'ready', openId = null, otpSent, done, quizAnswers }: PolicyLibraryScreenProps) {
  const [open, setOpen] = useState<string | null>(openId);
  const [tab, setTab] = useState('pending');
  const pending = policies.filter((p) => p.myStatus === 'Pending' || p.myStatus === 'Overdue');
  const shown = tab === 'pending' ? pending : policies;
  const policy = policies.find((p) => p.id === open);
  const reader = policy && (
    <div className="yx-ops-stack">
      <p className="yx-ops-muted">
        {policy.version} · effective {formatDate(policy.effective)} · owner {policy.owner}
      </p>
      <InlineAlert tone="info" title="What changed">
        {policy.changeSummary}
      </InlineAlert>
      <article className="yx-ops-stack" aria-label={`${policy.title} text`}>
        <h3 className="yx-ops-card__title">1. Purpose</h3>
        <p className="yx-ops-p">This policy sets out how everyone at Kaveri Foods Pvt Ltd is expected to behave at work, with customers and with suppliers, and what to do if something goes wrong.</p>
        <h3 className="yx-ops-card__title">2. Who it applies to</h3>
        <p className="yx-ops-p">All employees, trainees and contract workers at every Kaveri Foods location.</p>
        <h3 className="yx-ops-card__title">3. Raising a concern</h3>
        <p className="yx-ops-p">Raise concerns through Helpdesk › Speak-up. You can report anonymously; you will get an access code to follow your report.</p>
      </article>
      <PolicyAcknowledge policy={policy} today={today} otpSent={otpSent} done={done} quizAnswers={quizAnswers} />
    </div>
  );

  const list =
    state === 'loading' ? (
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading policies">
        <Skeleton height={56} />
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    ) : state === 'error' ? (
      <ErrorState title="We couldn't load policies." description="Try again in a moment." onRetry={() => {}} reference="POL-LIST-3302" />
    ) : state === 'empty' || shown.length === 0 ? (
      <EmptyState compact title={tab === 'pending' ? 'Nothing to acknowledge.' : 'No policies published for you yet.'} description={tab === 'pending' ? "You're up to date with every policy that applies to you." : undefined} />
    ) : (
      <ul className="yx-ops-list" aria-label="Policies">
        {shown.map((p) => (
          <li key={p.id} className="yx-ops-list__item">
            <span className="yx-ops-list__main">
              <a
                href={`#${p.id}`}
                className="yx-ops-list__title"
                onClick={(e) => {
                  e.preventDefault();
                  setOpen(p.id);
                }}
              >
                {p.title}
              </a>
              <span className="yx-ops-list__sub">
                {p.version} · {p.category}
                {p.due && p.myStatus !== 'Acknowledged' ? ` · due ${formatDate(p.due)}` : ''}
                {p.critical ? ' · needs a one-time code' : p.method === 'Quiz' ? ' · short quiz' : ''}
              </span>
            </span>
            <Badge tone={MY_POLICY_TONE[p.myStatus]}>{p.myStatus === 'Pending' ? 'Pending acknowledgement' : p.myStatus}</Badge>
          </li>
        ))}
      </ul>
    );

  const tabs = (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Policy lists">
        <TabsTrigger value="pending" count={pending.length}>
          To acknowledge
        </TabsTrigger>
        <TabsTrigger value="all">All policies</TabsTrigger>
      </TabsList>
      <TabsContent value={tab}>{list}</TabsContent>
    </Tabs>
  );

  if (device === 'phone') {
    return (
      <PhoneFrame tab="me" title={policy ? policy.title : 'Policies'} back={<IconButton icon={ArrowLeft} label={policy ? 'Back to policies' : 'Back to Me'} onClick={() => setOpen(null)} />}>
        {policy ? reader : tabs}
      </PhoneFrame>
    );
  }
  return (
    <OpsDesk area="helpdesk" active="Policies" member={false} counts={{ Policies: pending.length }}>
      <PageHeader title="Policies" description="Company policies that apply to you. Acknowledge new versions by the due date." facts={`${pending.length} to acknowledge`} />
      {pending.some((p) => p.myStatus === 'Overdue') && <PageBanner tone="warning">One policy is overdue. Your manager gets a reminder after 7 days.</PageBanner>}
      <Card>{tabs}</Card>
      <Drawer open={!!policy} onOpenChange={(o) => !o && setOpen(null)} title={policy?.title ?? ''} subtitle={policy ? `${policy.version} · ${policy.category}` : ''} size="lg">
        {reader}
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-11 · Policy admin (T3 / T6, HR)
 * ======================================================================================= */

export interface PolicyAdminScreenProps {
  policy: PolicyRow;
  byDept: { dept: string; audience: number; acknowledged: number }[];
  pendingPeople: { name: string; dept: string; manager: string; daysOverdue: number }[];
  versions: { v: string; effective: Date; summary: string; reack: boolean; acked: number; audience: number }[];
  today: Date;
  publishOpen?: boolean;
  tab?: 'overview' | 'versions' | 'audience' | 'pending';
}
export function PolicyAdminScreen({ policy, byDept, pendingPeople, versions, today, publishOpen, tab = 'overview' }: PolicyAdminScreenProps) {
  const [open, setOpen] = useState(!!publishOpen);
  const [reack, setReack] = useState(true);
  const [current, setCurrent] = useState(tab);
  const [method, setMethod] = useState<string>(policy.method);
  const pct = ackPercent(policy.acknowledged, policy.audience);
  return (
    <OpsDesk area="helpdesk" active="Policies">
      <ObjectHeader
        name={policy.title}
        icon={FileText}
        secondary={`${policy.version} · effective ${formatDate(policy.effective)} · owner ${policy.owner}`}
        status={
          <>
            <Badge tone="success">Published</Badge>
            {policy.critical && <Badge tone="info">Critical: one-time code</Badge>}
          </>
        }
        facts={[
          { label: 'Acknowledged', value: `${pct}%` },
          { label: 'Audience', value: `${policy.audience} people` },
          { label: 'Pending', value: policy.audience - policy.acknowledged },
          { label: 'Due', value: policy.due ? formatDate(policy.due) : '—' },
        ]}
        actions={
          <>
            <Button>Send reminder</Button>
            <Button variant="primary" onClick={() => setOpen(true)}>
              Publish new version
            </Button>
          </>
        }
      />
      <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
        <TabsList aria-label="Policy sections">
          <TabsTrigger value="overview">Acknowledgement</TabsTrigger>
          <TabsTrigger value="pending" count={pendingPeople.length}>
            Pending people
          </TabsTrigger>
          <TabsTrigger value="versions" count={versions.length}>
            Versions
          </TabsTrigger>
          <TabsTrigger value="audience">Audience & method</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="yx-ops-stack">
            <Meter label="Acknowledged" value={policy.acknowledged} max={policy.audience} valueText={`${policy.acknowledged} of ${policy.audience} (${pct}%)`} />
            <BarChart
              title="Acknowledged by department"
              xLabel="Department"
              orientation="horizontal"
              categories={byDept.map((d) => d.dept)}
              series={[{ name: 'Acknowledged %', values: byDept.map((d) => ackPercent(d.acknowledged, d.audience)) }]}
              groupSizes={byDept.map((d) => d.audience)}
              minGroupSize={5}
            />
          </div>
        </TabsContent>
        <TabsContent value="pending">
          <DataTable
            label="People who haven't acknowledged"
            columns={[
              { key: 'name', header: 'Employee', type: 'person', value: (r: (typeof pendingPeople)[number]) => r.name, person: (r) => ({ name: r.name, secondary: r.dept }) },
              { key: 'manager', header: 'Manager', value: (r) => r.manager },
              { key: 'days', header: 'Days overdue', type: 'number', value: (r) => r.daysOverdue },
              { key: 'esc', header: 'Escalation', type: 'status', value: (r) => (r.daysOverdue > 7 ? 'Manager told' : r.daysOverdue > 0 ? 'Reminded' : 'Not due'), statusTone: (v) => (v === 'Manager told' ? 'danger' : v === 'Reminded' ? 'warning' : 'neutral') },
            ]}
            rows={pendingPeople}
            getRowId={(r) => r.name}
            selectable
            bulkActions={(ids) => <Button size="sm">Remind {ids.length}</Button>}
            empty={<EmptyState compact title="Everyone has acknowledged." />}
          />
        </TabsContent>
        <TabsContent value="versions">
          <DataTable
            label="Versions"
            columns={[
              { key: 'v', header: 'Version', type: 'id', value: (r: (typeof versions)[number]) => r.v },
              { key: 'eff', header: 'Effective', type: 'date', value: (r) => r.effective },
              { key: 'sum', header: 'What changed', value: (r) => r.summary, width: 360 },
              { key: 'reack', header: 'Asked to acknowledge again', value: (r) => (r.reack ? 'Yes' : 'No') },
              { key: 'ack', header: 'Acknowledged', value: (r) => `${ackPercent(r.acked, r.audience)}%` },
            ]}
            rows={versions}
            getRowId={(r) => r.v}
          />
        </TabsContent>
        <TabsContent value="audience">
          <Card>
            <div className="yx-ops-stack">
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Entities', value: 'Kaveri Foods Pvt Ltd, Kaveri Foods Pvt Ltd (Tamil Nadu)' },
                  { label: 'Locations', value: 'All locations' },
                  { label: 'Departments', value: 'All departments' },
                  { label: 'Designations', value: 'All' },
                  { label: 'New joiners', value: 'Added as an onboarding task' },
                  { label: 'Reminders', value: 'Every 3 days; manager told after 7 days overdue' },
                ]}
              />
              <FormField label="How people acknowledge">
                <RadioGroup
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: 'Click', label: 'Confirmation click', description: 'Default for most policies' },
                    { value: 'OTP', label: 'One-time code', description: 'For critical policies; keeps signed evidence' },
                    { value: 'Quiz', label: 'Short quiz', description: 'From Learning; all answers must be correct' },
                  ]}
                />
              </FormField>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title={`Publish ${policy.title} ${`v${Number(policy.version.slice(1)) + 1}`}?`}
        description={`Effective ${formatDate(today)}. Earlier acknowledgements stay on record.`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Publish version
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <FormField label="What changed" required helper="Shown to employees at the top of the policy">
            <TextArea defaultValue="Adds rules for accepting gifts from suppliers." rows={3} />
          </FormField>
          <Switch checked={reack} onChange={setReack} label="Ask everyone to acknowledge again" description="Use for major changes." />
          <InlineAlert tone={reack ? 'warning' : 'info'}>{reack ? `${policy.audience} people move to pending and get a reminder. Reminders respect quiet hours.` : 'Nobody is asked again. The new text shows from the effective date.'}</InlineAlert>
        </div>
      </Dialog>
    </OpsDesk>
  );
}

