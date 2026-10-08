import { type ReactNode, useEffect, useState } from 'react';
import { MessageSquare, Send, Ticket as TicketIcon, UserPlus, X } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, PersonLabel, Tag } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { FileUpload } from '../../components/upload';
import { RichTextEditor } from '../../components/editor';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/menu';
import { Dialog } from '../../components/overlay';
import { Card, DescriptionList, ObjectHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody, PRIORITY_LABEL, PriorityBadge, STATE_LABEL, StatusBadge, TicketFlags, fillCanned, minutesText, when } from './desk-kit';
import { FileList } from './help';
import type { Attachment, CannedResponse, DeskDetail, LoadState, Person, Presence, RequesterContext, TicketChange, TicketDetail, TimelineEntry } from './types';

// HLP-03 Ticket workspace, wired (US-B-090, US-B-091, US-G-003, SD-1.08): replies and internal notes with mentions,
// saved replies, files, who else is on the ticket, time, the requester's other tickets, the timeline. Collaborators
// get notes only; a desk admin's view is read-only. Every action is checked again on the server.

export interface TicketScreenProps {
  state: LoadState;
  onRetry?: () => void;
  ticket: TicketDetail | null;
  detail: DeskDetail | null;
  canned: CannedResponse[];
  timeline: TimelineEntry[];
  context: RequesterContext | null;
  others: Presence[];
  meName: string;
  meId: string;
  onBack: () => void;
  onUpdate: (change: TicketChange) => Promise<void>;
  onAssign: (userId: string | null) => Promise<void>;
  onPost: (m: { kind: 'reply' | 'note'; bodyHtml: string; mentions: string[]; attachmentIds: string[]; statusId?: string }) => Promise<void>;
  onEditNote?: (messageId: string, bodyHtml: string) => Promise<void>;
  onUpload: (file: File) => Promise<Attachment>;
  onOpenFile: (attachmentId: string) => Promise<void>;
  onAddTime: (minutes: number, note: string) => Promise<void>;
  onRunScenario: (scenarioId: string) => Promise<void>;
  onConvert: (typeId: string, reason: string) => Promise<void>;
  onAddCollaborator: (userId: string) => Promise<void>;
  onRemoveCollaborator: (userId: string) => Promise<void>;
  onAddWatcher: (personId: string) => Promise<void>;
  onRemoveWatcher: (watcherId: string) => Promise<void>;
  onSearchPeople: (q: string) => Promise<Person[]>;
  /** Tells others this person is here, and whether typing (YX-SD-07). */
  onTyping: (typing: boolean) => void;
  onOpenTicket: (id: string) => void;
  /** Batch 2 cards for the right-hand rail (response targets, tasks, related tickets, side threads, reminders). */
  rail?: ReactNode;
  /** Opens the resolve dialog (resolution code and note) instead of resolving at once. */
  onResolveClick?: () => void;
  /** Opens the support-level dialog (L1 / L2 / L3). */
  onEscalateClick?: () => void;
}

const empty = (html: string) => !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

export function TicketScreen(props: TicketScreenProps) {
  const t = props.ticket;
  const d = props.detail;
  const { busy, error, run } = useRun();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [draft, setDraft] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [mentions, setMentions] = useState<string[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const [priorityAsk, setPriorityAsk] = useState<number | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  useEffect(() => {
    if (t && !t.canWork) setMode('note');
  }, [t]);
  useEffect(() => props.onTyping(!empty(draft)), [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t || !d) return <DeskPage state={props.state === 'ready' ? 'loading' : props.state} onRetry={props.onRetry} what="this ticket">{null}</DeskPage>;

  const first = (t.requester?.name ?? '').split(' ')[0] || 'the requester';
  const statuses = d.statuses.filter((s) => s.active && (!s.ticketTypeId || s.ticketTypeId === t.typeId));
  const agents = d.members.filter((m) => m.active && (m.role === 'agent' || m.role === 'lead'));
  const mentionable = d.members.filter((m) => m.active && m.userId !== props.meId);
  const collaborators = d.members.filter((m) => m.active && m.role === 'collaborator' && !t.collaborators.some((c) => c.userId === m.userId));
  const solved = statuses.find((s) => s.systemState === 'solved');
  const work = t.canWork;
  const unsent = t.attachments.filter((a) => !a.messageId);
  const byMessage = new Map<string, Attachment[]>();
  for (const a of t.attachments) if (a.messageId) byMessage.set(a.messageId, [...(byMessage.get(a.messageId) ?? []), a]);
  const typing = props.others.filter((o) => o.typing);
  const update = (c: TicketChange) => void run('update', () => props.onUpdate(c));

  const send = () =>
    void run('send', async () => {
      await props.onPost({ kind: mode, bodyHtml: draft, mentions: mode === 'note' ? mentions : [], attachmentIds: files.map((f) => f.id), statusId: mode === 'reply' ? (after ?? undefined) : undefined });
      setDraft('');
      setMentions([]);
      setFiles([]);
      setAfter(null);
      setEditorKey((k) => k + 1);
    });

  return (
    <DeskPage state={props.state} onRetry={props.onRetry} what="this ticket">
      <ObjectHeader
        name={t.subject}
        icon={TicketIcon}
        secondary={
          <span>
            <span className="yx-ops-mono">{t.number}</span> · {t.desk.name} · {t.type?.name} · raised {when(t.createdAt)} via {t.channel}
          </span>
        }
        status={
          <>
            <StatusBadge label={t.status?.label ?? ''} state={t.systemState} />
            <PriorityBadge priority={t.priority} />
            {t.tier && <Badge tone="neutral">Level {t.tier}</Badge>}
            {t.tracker && <Badge tone="info">Tracker</Badge>}
            <TicketFlags sensitive={t.sensitive} private={t.private} vip={t.vip} />
            {t.access === 'observer' && <Badge tone="neutral">Read-only: you set this desk up</Badge>}
            {t.access === 'collaborator' && <Badge tone="neutral">You are a collaborator: notes only</Badge>}
          </>
        }
        actions={
          <>
            <Button onClick={props.onBack}>Back to tickets</Button>
            {work && t.assigneeUserId !== props.meId && (
              <Button loading={busy === 'take'} onClick={() => void run('take', () => props.onAssign(props.meId))}>
                Assign to me
              </Button>
            )}
            {work && solved && t.systemState !== 'solved' && t.systemState !== 'closed' && (
              <Button variant="primary" loading={busy === 'update'} onClick={() => (props.onResolveClick ? props.onResolveClick() : update({ statusId: solved.id }))}>
                Resolve
              </Button>
            )}
          </>
        }
        menu={
          work ? (
            <>
              <MenuItem onSelect={() => setConvertOpen(true)}>Change ticket type</MenuItem>
              {props.onEscalateClick && <MenuItem onSelect={props.onEscalateClick}>Move to another support level</MenuItem>}
              {d.scenarios
                .filter((s) => s.active)
                .map((s) => (
                  <MenuItem key={s.id} onSelect={() => void run('scenario', () => props.onRunScenario(s.id))}>
                    Run “{s.name}”
                  </MenuItem>
                ))}
            </>
          ) : undefined
        }
      />
      {props.others.length > 0 && (
        <InlineAlert tone="warning" title={typing.length ? `${typing.map((o) => o.name).join(', ')} ${typing.length > 1 ? 'are' : 'is'} writing on this ticket` : `${props.others.map((o) => o.name).join(', ')} ${props.others.length > 1 ? 'are' : 'is'} also on this ticket`}>
          Check before you reply so the requester is not answered twice.
        </InlineAlert>
      )}
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <div className="yx-ops-ws">
        <div className="yx-ops-ws__main">
          <Card title="Conversation">
            <ol className="yx-ops-conv" aria-label="Conversation">
              {t.messages.map((m) => (
                <li key={m.id} className="yx-ops-msg" data-kind={m.kind === 'note' ? 'note' : m.side === 'agent' ? 'mine' : undefined}>
                  <span className="yx-ops-msg__meta">
                    <span className="yx-ops-msg__who">{m.author}</span>
                    {m.kind === 'note' && <Badge tone="warning">Internal note: {first} never sees it</Badge>}
                    {m.fromTicketId && <Badge tone="neutral">From a merged ticket</Badge>}
                    <span>{when(m.createdAt)}</span>
                    {m.editedAt && <span>· edited</span>}
                  </span>
                  <MessageBody html={m.bodyHtml} />
                  <FileList files={byMessage.get(m.id) ?? []} onOpen={(id) => void run(`file-${id}`, () => props.onOpenFile(id))} />
                </li>
              ))}
            </ol>
            <FileList files={unsent} onOpen={(id) => void run(`file-${id}`, () => props.onOpenFile(id))} title="Files not sent yet (internal)" />
          </Card>
          {(work || t.canNote) && (
            <Card title="Respond">
              <Tabs value={mode} onValueChange={(v) => setMode(v as 'reply' | 'note')}>
                <TabsList aria-label="Response type">
                  {work && <TabsTrigger value="reply">Reply to {first}</TabsTrigger>}
                  <TabsTrigger value="note">Internal note</TabsTrigger>
                </TabsList>
                <TabsContent value={mode}>
                  <div className="yx-ops-stack">
                    {mode === 'note' && <p className="yx-ops-muted">Only people working this desk and the ticket’s collaborators see notes.</p>}
                    <FormField label={mode === 'note' ? 'Note' : 'Reply'} hideLabel>
                      <RichTextEditor key={editorKey} value={draft} onChange={setDraft} mergeFields={[]} placeholder={mode === 'note' ? 'Add a note for colleagues' : `Write to ${first}`} />
                    </FormField>
                    {mode === 'note' && (
                      <FormField label="Tell colleagues" optional helper="They get a notice. A desk collaborator is added to this ticket.">
                        <MultiSelect value={mentions} onChange={setMentions} options={mentionable.map((m) => ({ value: m.userId, label: m.name, description: m.role }))} placeholder="Choose people" />
                      </FormField>
                    )}
                    <FormField label="Files" optional helper={`${d.desk.attachmentTypes.join(', ')} · up to ${d.desk.attachmentMaxMb} MB. Checked for viruses before anyone can open them.`}>
                      <FileUpload
                        key={editorKey}
                        accept={d.desk.attachmentTypes.map((x) => `.${x}`)}
                        maxSize={d.desk.attachmentMaxMb * 1024 * 1024}
                        upload={async (file, h) => {
                          h.onScanning();
                          const a = await props.onUpload(file);
                          setFiles((f) => [...f, a]);
                        }}
                      />
                    </FormField>
                    {mode === 'reply' && (
                      <FormField label="Then set the status" optional>
                        <Select value={after} onChange={setAfter} clearable options={statuses.map((s) => ({ value: s.id, label: s.label }))} placeholder="Keep as it is" />
                      </FormField>
                    )}
                    <div className="yx-ops-row">
                      {work && props.canned.length > 0 && (
                        <Menu>
                          <MenuTrigger asChild>
                            <Button icon={MessageSquare}>Insert saved reply</Button>
                          </MenuTrigger>
                          <MenuContent>
                            {props.canned
                              .filter((c) => c.active)
                              .map((c) => (
                                <MenuItem key={c.id} onSelect={() => setDraft((x) => `${x}${fillCanned(c.bodyHtml, { firstName: first, number: t.number, agent: props.meName })}`)}>
                                  {c.title}
                                  {c.personal ? ' (mine)' : ''}
                                </MenuItem>
                              ))}
                          </MenuContent>
                        </Menu>
                      )}
                      <Button variant="primary" icon={Send} onClick={send} disabled={empty(draft)} loading={busy === 'send'}>
                        {mode === 'note' ? 'Add note' : 'Send reply'}
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          )}
          <Card title="Timeline">
            {props.timeline.length === 0 ? (
              <p className="yx-ops-muted">Nothing yet.</p>
            ) : (
              <ul className="yx-ops-list" aria-label="Timeline">
                {props.timeline.map((e) => (
                  <li key={e.id} className="yx-ops-list__item">
                    <span className="yx-ops-list__main">
                      <span>{eventText(e)}</span>
                      <span className="yx-ops-list__sub">
                        {e.by} · {when(e.at)}
                        {e.reason ? ` · ${e.reason}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="yx-ops-ws__rail">
          <Card title="Details">
            <div className="yx-ops-stack">
              <FormField label="Status">
                <Select value={t.statusId} onChange={(v) => v && update({ statusId: v })} options={statuses.map((s) => ({ value: s.id, label: s.label, description: STATE_LABEL[s.systemState] }))} disabled={!work} />
              </FormField>
              <FormField label="Priority">
                {work ? <Segment label="Priority" options={[1, 2, 3, 4].map((p) => ({ value: p, label: `P${p}` }))} value={t.priority} onChange={(p) => p !== t.priority && setPriorityAsk(p)} /> : <PriorityBadge priority={t.priority} />}
              </FormField>
              <FormField label="Owner">
                <Select
                  value={t.assigneeUserId}
                  onChange={(v) => void run('assign', () => props.onAssign(v))}
                  clearable={work && (t.canAssignOthers || t.assigneeUserId === props.meId)}
                  options={agents.filter((m) => t.canAssignOthers || m.userId === props.meId || m.userId === t.assigneeUserId).map((m) => ({ value: m.userId, label: m.userId === props.meId ? `${m.name} (me)` : m.name }))}
                  placeholder="Unassigned"
                  disabled={!work}
                />
              </FormField>
              <FormField label="Group">
                <Select value={t.groupId} onChange={(v) => update({ groupId: v })} clearable options={d.groups.filter((g) => g.active).map((g) => ({ value: g.id, label: g.name }))} placeholder="No group" disabled={!work} />
              </FormField>
              <FormField label="Category">
                <Select value={t.categoryId} onChange={(v) => update({ categoryId: v })} clearable options={d.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name, description: c.sensitive ? 'Sensitive: agents only' : undefined }))} placeholder="No category" disabled={!work} />
              </FormField>
              <TagEditor tags={t.tags} disabled={!work} onChange={(tags) => update({ tags })} />
              <Switch label="Private" description="Only this desk’s agents and the ticket’s collaborators see it." checked={t.private} disabled={!work} onChange={(p) => update({ private: p })} />
            </div>
          </Card>
          <Card title="Requester">
            <RequesterPanel ticket={t} context={props.context} onOpenTicket={props.onOpenTicket} />
          </Card>
          <Card title="People on this ticket">
            <PeoplePanel
              ticket={t}
              collaborators={collaborators}
              work={work}
              busy={busy}
              onSearchPeople={props.onSearchPeople}
              onAddWatcher={(id) => void run('watch', () => props.onAddWatcher(id))}
              onRemoveWatcher={(id) => void run('unwatch', () => props.onRemoveWatcher(id))}
              onAddCollaborator={(id) => void run('collab', () => props.onAddCollaborator(id))}
              onRemoveCollaborator={(id) => void run('uncollab', () => props.onRemoveCollaborator(id))}
            />
          </Card>
          <Card title="Time spent">
            <TimePanel ticket={t} work={work} busy={busy === 'time'} onAdd={(m, n) => void run('time', () => props.onAddTime(m, n))} />
          </Card>
          {props.rail}
        </div>
      </div>
      <PriorityDialog value={priorityAsk} onClose={() => setPriorityAsk(null)} onSave={(p, reason) => update({ priority: p, priorityReason: reason })} />
      <ConvertDialog open={convertOpen} onOpenChange={setConvertOpen} types={d.types.filter((x) => x.active && x.id !== t.typeId)} onConvert={(typeId, reason) => void run('convert', () => props.onConvert(typeId, reason))} />
    </DeskPage>
  );
}

const EVENT_WORDS: Record<string, string> = {
  created: 'Ticket raised',
  assigned: 'Owner changed',
  status_changed: 'Status changed',
  priority_changed: 'Priority changed',
  category_changed: 'Category changed',
  group_changed: 'Group changed',
  tags_changed: 'Tags changed',
  type_changed: 'Ticket type changed',
  subject_changed: 'Subject changed',
  privacy_changed: 'Privacy changed',
  watcher_added: 'Someone now follows it',
  watcher_removed: 'Someone stopped following it',
  collaborator_added: 'Collaborator added',
  collaborator_removed: 'Collaborator removed',
  linked: 'Linked',
  unlinked: 'Link removed',
  merged: 'Merged into',
  merged_in: 'Ticket merged in',
  split: 'Split into',
  parent_changed: 'Parent changed',
  tracker_changed: 'Tracker changed',
  side_started: 'Side conversation started',
  task_added: 'Task added',
  task_changed: 'Task changed',
  tier_changed: 'Support level changed',
  sla_milestone: 'Response target milestone',
  sla_breached: 'Response target missed',
};

export function eventText(e: TimelineEntry): string {
  const words = EVENT_WORDS[e.kind] ?? e.kind.replace(/_/g, ' ');
  if (e.kind === 'priority_changed') return `${words}: P${e.from} → P${e.to}`;
  if (e.kind === 'assigned') return e.to ? `Assigned to ${e.to}` : 'Owner removed';
  if (e.kind === 'created' || e.kind.startsWith('watcher') || e.kind.startsWith('collaborator')) return words;
  return e.from || e.to ? `${words}: ${e.from ?? '—'} → ${e.to ?? '—'}` : words;
}

function TagEditor({ tags, disabled, onChange }: { tags: string[]; disabled: boolean; onChange: (t: string[]) => void }) {
  const [tag, setTag] = useState('');
  const ok = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u.test(tag.trim()) && !tags.includes(tag.trim());
  return (
    <FormField label="Tags">
      <div className="yx-ops-stack" data-gap="sm">
        {tags.length > 0 && (
          <span className="yx-ops-row">
            {tags.map((x) => (
              <Tag key={x} onRemove={disabled ? undefined : () => onChange(tags.filter((y) => y !== x))} removeLabel={`Remove tag ${x}`}>
                {x}
              </Tag>
            ))}
          </span>
        )}
        {!disabled && (
          <span className="yx-ops-row">
            <TextField size="sm" value={tag} onChange={setTag} aria-label="New tag" maxLength={40} />
            <Button
              size="sm"
              disabled={!ok}
              onClick={() => {
                onChange([...tags, tag.trim()]);
                setTag('');
              }}
            >
              Add tag
            </Button>
          </span>
        )}
      </div>
    </FormField>
  );
}

function RequesterPanel({ ticket, context, onOpenTicket }: { ticket: TicketDetail; context: RequesterContext | null; onOpenTicket: (id: string) => void }) {
  const r = ticket.requester;
  return (
    <div className="yx-ops-stack" data-gap="sm">
      {r && <PersonLabel name={r.name} secondary={r.email ?? undefined} size={32} />}
      {context?.vip && <Badge tone="info">VIP</Badge>}
      {ticket.requestedFor && <p className="yx-ops-muted">Raised for {ticket.requestedFor.name}</p>}
      {context?.employee && (
        <DescriptionList
          items={[
            { label: 'Employee code', value: context.employee.code ?? '—' },
            { label: 'Role', value: context.employee.designation ?? '—' },
            { label: 'Department', value: context.employee.department ?? '—' },
            { label: 'Location', value: context.employee.location ?? '—' },
          ]}
        />
      )}
      <p className="yx-ops-muted">Other tickets</p>
      {context && context.otherTickets.length ? (
        <ul className="yx-ops-list" aria-label="The requester's other tickets">
          {context.otherTickets.map((o) => (
            <li key={o.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <button type="button" className="yx-desk-link" onClick={() => onOpenTicket(o.id)}>
                  {o.subject}
                </button>
                <span className="yx-ops-list__sub">
                  {o.number} · {STATE_LABEL[o.systemState]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="yx-ops-muted">None you can see.</p>
      )}
      <p className="yx-ops-muted">Assets show here from phase 3b-3.</p>
    </div>
  );
}

function PeoplePanel(p: {
  ticket: TicketDetail;
  collaborators: { userId: string; name: string }[];
  work: boolean;
  busy: string | null;
  onSearchPeople: (q: string) => Promise<Person[]>;
  onAddWatcher: (personId: string) => void;
  onRemoveWatcher: (watcherId: string) => void;
  onAddCollaborator: (userId: string) => void;
  onRemoveCollaborator: (userId: string) => void;
}) {
  const [find, setFind] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [collab, setCollab] = useState<string | null>(null);
  useEffect(() => {
    if (!p.work || find.trim().length < 2) return setFound([]);
    const h = setTimeout(() => void p.onSearchPeople(find.trim()).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(h);
  }, [find, p.work]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = p.ticket;
  return (
    <div className="yx-ops-stack" data-gap="sm">
      <p className="yx-ops-muted">Following (they get replies, never notes)</p>
      {t.watchers.length ? (
        <ul className="yx-ops-list" aria-label="Following">
          {t.watchers.map((w) => (
            <li key={w.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span>{w.name}</span>
                <span className="yx-ops-list__sub">{w.external ? 'Outside the company' : 'Colleague'}</span>
              </span>
              {p.work && <IconButton icon={X} label={`Stop ${w.name} following`} size="sm" onClick={() => p.onRemoveWatcher(w.id)} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="yx-ops-muted">Nobody else.</p>
      )}
      {p.work && (
        <>
          <FormField label="Add someone to follow it" helper="Type two letters of a name or email">
            <TextField size="sm" value={find} onChange={setFind} />
          </FormField>
          {found.slice(0, 5).map((f) => (
            <Button key={f.id} size="sm" icon={UserPlus} onClick={() => p.onAddWatcher(f.id)}>
              {f.name}
              {f.email ? ` · ${f.email}` : ''}
            </Button>
          ))}
        </>
      )}
      <p className="yx-ops-muted">Collaborators (notes only, free)</p>
      {t.collaborators.length ? (
        <ul className="yx-ops-list" aria-label="Collaborators">
          {t.collaborators.map((c) => (
            <li key={c.userId} className="yx-ops-list__item">
              <span>{c.name}</span>
              {p.work && <IconButton icon={X} label={`Remove ${c.name}`} size="sm" onClick={() => p.onRemoveCollaborator(c.userId)} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="yx-ops-muted">None.</p>
      )}
      {p.work && p.collaborators.length > 0 && (
        <span className="yx-ops-row">
          <Select size="sm" value={collab} onChange={setCollab} options={p.collaborators.map((c) => ({ value: c.userId, label: c.name }))} placeholder="Choose a collaborator" aria-label="Collaborator to add" />
          <Button size="sm" disabled={!collab} loading={p.busy === 'collab'} onClick={() => collab && p.onAddCollaborator(collab)}>
            Add
          </Button>
        </span>
      )}
    </div>
  );
}

function TimePanel({ ticket, work, busy, onAdd }: { ticket: TicketDetail; work: boolean; busy: boolean; onAdd: (minutes: number, note: string) => void }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [note, setNote] = useState('');
  return (
    <div className="yx-ops-stack" data-gap="sm">
      <p>
        <strong>{minutesText(ticket.time.totalMinutes)}</strong> in total
      </p>
      {ticket.time.entries.length > 0 && (
        <ul className="yx-ops-list" aria-label="Time entries">
          {ticket.time.entries.map((e) => (
            <li key={e.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span>
                  {minutesText(e.minutes)} · {e.who}
                </span>
                <span className="yx-ops-list__sub">
                  {e.workedOn}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {work && (
        <>
          <FormField label="Minutes">
            <NumberField value={minutes} onChange={setMinutes} min={1} max={1440} />
          </FormField>
          <FormField label="What you did" optional>
            <TextArea value={note} onChange={setNote} rows={2} maxLength={500} />
          </FormField>
          <div className="yx-ops-row">
            <Button
              size="sm"
              loading={busy}
              disabled={!minutes || minutes < 1 || minutes > 1440}
              onClick={() => {
                onAdd(minutes!, note.trim());
                setMinutes(null);
                setNote('');
              }}
            >
              Log time
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PriorityDialog({ value, onClose, onSave }: { value: number | null; onClose: () => void; onSave: (p: number, reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={value !== null}
      onOpenChange={(o) => !o && onClose()}
      title={value ? `Change priority to ${PRIORITY_LABEL[value]}` : 'Change priority'}
      description="Priority normally comes from impact and urgency. Say why you are changing it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={reason.trim().length < 3}
            onClick={() => {
              onSave(value!, reason.trim());
              setReason('');
              onClose();
            }}
          >
            Change priority
          </Button>
        </>
      }
    >
      <FormField label="Reason" required>
        <TextField value={reason} onChange={setReason} maxLength={300} />
      </FormField>
    </Dialog>
  );
}

function ConvertDialog({ open, onOpenChange, types, onConvert }: { open: boolean; onOpenChange: (o: boolean) => void; types: { id: string; name: string }[]; onConvert: (typeId: string, reason: string) => void }) {
  const [typeId, setTypeId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change ticket type"
      description="The conversation and history stay. Response targets start again under the new type."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!typeId || reason.trim().length < 3}
            onClick={() => {
              onConvert(typeId!, reason.trim());
              onOpenChange(false);
            }}
          >
            Change type
          </Button>
        </>
      }
    >
      {types.length === 0 ? (
        <EmptyState compact title="No other ticket types on this desk." />
      ) : (
        <div className="yx-ops-stack">
          <FormField label="New type" required>
            <Select value={typeId} onChange={setTypeId} options={types.map((x) => ({ value: x.id, label: x.name }))} />
          </FormField>
          <FormField label="Reason" required>
            <TextField value={reason} onChange={setReason} maxLength={300} />
          </FormField>
        </div>
      )}
    </Dialog>
  );
}
