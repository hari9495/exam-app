import { useState } from 'react';
import { BellRing, Eye, GitMerge, Link2, ListChecks, MessagesSquare, Moon, Scissors, Timer } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Dialog } from '../../components/overlay';
import { Card } from '../../components/shell';
import { X } from 'lucide-react';
import { useRun } from '../org/org-kit';
import { MessageBody, STATE_LABEL, minutesText, when } from './desk-kit';
import type { DeskDetail, DeskSummary, DeskTemplates, TaskView, TicketBrief, TicketDetail, TicketWork } from './types';

// Batch 2 panels of the ticket workspace (SD-1.09 … SD-1.17): the SLA timeline with breach reasons and exclusions,
// tasks and checklists, family and links (merge, split, parent, tracker), side conversations, reminders and snooze,
// masked personal data, plus the resolve and escalate dialogs. Presentational: every call is checked on the server.

export interface TicketWorkProps {
  ticket: TicketDetail;
  detail: DeskDetail;
  work: TicketWork | null;
  desks: DeskSummary[];
  meId: string;
  onFindTicket: (q: string) => Promise<TicketBrief[]>;
  onOpenTicket: (id: string) => void;
  onLink: (ticketId: string, kind: string) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
  onMerge: (intoTicketId: string) => Promise<void>;
  onSplit: (input: { messageId?: string; subject: string }) => Promise<{ id: string }>;
  onSetParent: (parentId: string | null) => Promise<void>;
  onSetTracker: (tracker: boolean) => Promise<void>;
  onStartSide: (input: { channel: 'note_thread' | 'child_ticket'; subject: string; withWhom?: string; bodyHtml: string; deskId?: string }) => Promise<void>;
  onSideMessage: (sideId: string, bodyHtml: string) => Promise<void>;
  onCloseSide: (sideId: string) => Promise<void>;
  onAddTask: (input: { title: string; assigneeUserId?: string; groupId?: string; dueAt?: string; checklist?: boolean }) => Promise<void>;
  onUpdateTask: (task: TaskView, change: { state?: TaskView['state'] }) => Promise<void>;
  onBreachReason: (timerId: string, reason: string) => Promise<void>;
  onExclude: (timerId: string, reason: string) => Promise<void>;
  onRemind: (remindAt: string, note: string) => Promise<void>;
  onSnooze: (until: string) => Promise<void>;
  onDoneReminder: (id: string) => Promise<void>;
  onUnmask: (valueId: string) => Promise<string>;
}

const STATE_WORDS: Record<string, string> = { running: 'Running', paused: 'Paused', met: 'Met', cancelled: 'Stopped' };
const TASK_STATES: { value: TaskView['state']; label: string }[] = [
  { value: 'open', label: 'To do' },
  { value: 'in_progress', label: 'Doing' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];
const html = (text: string) => `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;
/** "2026-10-09T15:00" in the viewer's zone, for datetime-local inputs. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** US-G-016: each target with its running, paused and missed stretches, the reasons, and what a lead may approve. */
export function SlaCard({ work, canWork, onBreachReason, onExclude }: { work: TicketWork; canWork: boolean; onBreachReason: TicketWorkProps['onBreachReason']; onExclude: TicketWorkProps['onExclude'] }) {
  const { busy, error, run } = useRun();
  const [reason, setReason] = useState<Record<string, string>>({});
  const shown = work.sla.filter((x) => x.state !== 'cancelled' || x.breached);
  return (
    <Card title="Response targets">
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {shown.length === 0 ? (
        <p className="yx-ops-muted">No response target applies to this ticket.</p>
      ) : (
        <ul className="yx-ops-list" aria-label="Response targets">
          {shown.map((x) => {
            const total = x.segments.reduce((s, g) => s + (Date.parse(g.to) - Date.parse(g.from)), 0) || 1;
            return (
              <li key={x.id} className="yx-ops-list__item">
                <div className="yx-ops-stack" data-gap="sm" style={{ width: '100%' }}>
                  <span className="yx-ops-row">
                    <Timer aria-hidden size={14} />
                    <strong>{x.label}</strong>
                    <Badge tone={x.breached ? 'danger' : x.state === 'paused' ? 'warning' : x.state === 'met' ? 'success' : 'neutral'}>{x.breached ? (x.state === 'met' ? 'Met late' : 'Missed') : STATE_WORDS[x.state]}</Badge>
                    {x.excluded && <Badge tone="neutral">Left out of reports</Badge>}
                  </span>
                  <Meter value={Math.min(x.percent, 150)} max={100} warnAt={75} dangerAt={100} label={`${x.label} time used`} valueText={`${x.percent} % of ${minutesText(Math.round(x.targetSeconds / 60))}`} />
                  <span className="yx-ops-muted">
                    {x.state === 'running' && x.dueAt ? `Due ${when(x.dueAt)}` : x.state === 'paused' ? `Paused: ${x.pauseReason ?? 'waiting'}` : x.metAt ? `Met ${when(x.metAt)}` : x.cancelReason ?? ''}
                    {x.breachedAt ? ` · missed at ${when(x.breachedAt)}` : ''}
                  </span>
                  {/* The picture of the clock: each stretch in words too (never colour alone). */}
                  <div className="yx-desk-sla-bar" role="list" aria-label={`${x.label} timeline`}>
                    {x.segments.map((g, i) => (
                      <span key={i} role="listitem" className="yx-desk-sla-bar__part" data-state={g.state} style={{ flexGrow: Math.max(1, ((Date.parse(g.to) - Date.parse(g.from)) * 100) / total) }} title={`${g.state === 'breached' ? 'Late' : g.state === 'paused' ? `Paused${g.reason ? ` (${g.reason})` : ''}` : 'Running'}: ${when(g.from)} to ${when(g.to)}`}>
                        <span className="yx-visually-hidden">{`${g.state === 'breached' ? 'Late' : g.state === 'paused' ? `Paused${g.reason ? ` (${g.reason})` : ''}` : 'Running'} from ${when(g.from)} to ${when(g.to)}`}</span>
                      </span>
                    ))}
                  </div>
                  {x.breachReason && <span>Why it was missed: {x.breachReason}</span>}
                  {x.excluded && x.exclusionReason && <span className="yx-ops-muted">Left out because: {x.exclusionReason}</span>}
                  {x.breached && canWork && !x.breachReason && (
                    <span className="yx-ops-row">
                      <TextField size="sm" aria-label={`Why ${x.label} was missed`} placeholder="Why was it missed?" value={reason[x.id] ?? ''} onChange={(v) => setReason({ ...reason, [x.id]: v })} maxLength={500} />
                      <Button size="sm" disabled={(reason[x.id] ?? '').trim().length < 3} loading={busy === `r-${x.id}`} onClick={() => void run(`r-${x.id}`, () => onBreachReason(x.id, reason[x.id].trim()))}>
                        Save reason
                      </Button>
                    </span>
                  )}
                  {x.breached && work.canExclude && !x.excluded && (
                    <span className="yx-ops-row">
                      <TextField size="sm" aria-label={`Why leave ${x.label} out`} placeholder="Why leave it out of reports?" value={reason[`e${x.id}`] ?? ''} onChange={(v) => setReason({ ...reason, [`e${x.id}`]: v })} maxLength={500} />
                      <Button size="sm" disabled={(reason[`e${x.id}`] ?? '').trim().length < 3} loading={busy === `e-${x.id}`} onClick={() => void run(`e-${x.id}`, () => onExclude(x.id, reason[`e${x.id}`].trim()))}>
                        Leave out of reports
                      </Button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** US-G-006: tasks and checklist items; open ones keep the ticket from being resolved. */
export function TasksCard({ ticket, detail, work, meId, onAddTask, onUpdateTask }: Pick<TicketWorkProps, 'ticket' | 'detail' | 'work' | 'meId' | 'onAddTask' | 'onUpdateTask'>) {
  const { busy, error, run } = useRun();
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [due, setDue] = useState('');
  const tasks = work?.tasks ?? [];
  const people = detail.members.filter((m) => m.active && m.role !== 'admin');
  const open = tasks.filter((k) => k.state === 'open' || k.state === 'in_progress').length;
  return (
    <Card title={`Tasks${open ? ` · ${open} open` : ''}`}>
      <div className="yx-ops-stack" data-gap="sm">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {tasks.length === 0 ? (
          <p className="yx-ops-muted">No tasks yet.</p>
        ) : (
          <ul className="yx-ops-list" aria-label="Tasks">
            {tasks.map((k) => {
              const mayChange = ticket.canWork || k.assigneeUserId === meId;
              return (
                <li key={k.id} className="yx-ops-list__item">
                  <span className="yx-ops-list__main">
                    <span>
                      {k.checklist ? <ListChecks aria-hidden size={14} /> : null} {k.title}
                    </span>
                    <span className="yx-ops-list__sub">
                      {k.assignee ?? 'Nobody yet'}
                      {k.dueAt ? ` · due ${when(k.dueAt)}` : ''}
                    </span>
                    {mayChange ? (
                      <Segment label={`State of ${k.title}`} options={TASK_STATES} value={k.state} onChange={(state) => state !== k.state && void run(`t-${k.id}`, () => onUpdateTask(k, { state }))} />
                    ) : (
                      <Badge tone="neutral">{TASK_STATES.find((s) => s.value === k.state)?.label}</Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {ticket.canWork && (
          <>
            <FormField label="New task">
              <TextField size="sm" value={title} onChange={setTitle} maxLength={200} placeholder="What needs doing" />
            </FormField>
            <span className="yx-ops-row">
              <Select size="sm" aria-label="Who does it" value={who} onChange={setWho} clearable options={people.map((m) => ({ value: m.userId, label: m.userId === meId ? `${m.name} (me)` : m.name, description: m.role === 'collaborator' ? 'Collaborator (free)' : undefined }))} placeholder="Who does it" />
              <Select size="sm" aria-label="Group (team task, timed)" value={group} onChange={setGroup} clearable options={detail.groups.filter((g) => g.active).map((g) => ({ value: g.id, label: g.name }))} placeholder="Team" />
              <TextField size="sm" type="datetime-local" aria-label="Due" value={due} onChange={setDue} />
            </span>
            <div className="yx-ops-row">
              <Button
                size="sm"
                disabled={!title.trim()}
                loading={busy === 'add'}
                onClick={() =>
                  void run('add', async () => {
                    await onAddTask({ title: title.trim(), ...(who ? { assigneeUserId: who } : {}), ...(group ? { groupId: group } : {}), ...(due ? { dueAt: new Date(due).toISOString() } : {}) });
                    setTitle('');
                    setDue('');
                  })
                }
              >
                Add task
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/** US-B-092, US-G-005, US-G-220: parent and children, merged tickets, links, split, tracker. */
export function FamilyCard(p: Pick<TicketWorkProps, 'ticket' | 'work' | 'onFindTicket' | 'onOpenTicket' | 'onLink' | 'onUnlink' | 'onMerge' | 'onSplit' | 'onSetParent' | 'onSetTracker'>) {
  const { busy, error, run } = useRun();
  const [find, setFind] = useState('');
  const [found, setFound] = useState<TicketBrief[]>([]);
  const [kind, setKind] = useState<'related' | 'blocks' | 'caused_by' | 'tracked_by'>('related');
  const [mergeTo, setMergeTo] = useState<TicketBrief | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const w = p.work;
  const t = p.ticket;
  const go = (b: TicketBrief) => (
    <button type="button" className="yx-desk-link" onClick={() => p.onOpenTicket(b.id)}>
      {b.number} · {b.subject}
    </button>
  );
  const search = () => void run('find', async () => setFound((await p.onFindTicket(find.trim())).filter((x) => x.id !== t.id)));
  return (
    <Card title="Related tickets">
      <div className="yx-ops-stack" data-gap="sm">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {w?.mergedInto && <InlineAlert tone="info" title="This ticket was merged">Work continues on {go(w.mergedInto)}.</InlineAlert>}
        {w?.parent && <p>Part of {go(w.parent)}</p>}
        {!!w?.children.length && (
          <div>
            <p className="yx-ops-muted">Child tickets</p>
            <ul className="yx-ops-list">{w.children.map((c) => <li key={c.id} className="yx-ops-list__item">{go(c)} · {STATE_LABEL[c.systemState]}</li>)}</ul>
          </div>
        )}
        {!!w?.merged.length && <p className="yx-ops-muted">Merged here: {w.merged.map((m) => m.number).join(', ')}</p>}
        {w?.links.length ? (
          <ul className="yx-ops-list" aria-label="Links">
            {w.links.map((l) => (
              <li key={l.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__sub">{l.words}</span>
                  {go(l.ticket)}
                </span>
                {t.canWork && !['duplicate', 'follow_up'].includes(l.kind) && <IconButton icon={X} size="sm" label={`Remove link to ${l.ticket.number}`} onClick={() => void run(`u-${l.id}`, () => p.onUnlink(l.id))} />}
              </li>
            ))}
          </ul>
        ) : (
          !w?.parent && !w?.children.length && <p className="yx-ops-muted">No related tickets.</p>
        )}
        {t.canWork && (
          <>
            <Switch label="This is a tracker" description="Tickets linked as “tracked by” get one message and are solved when it is." checked={Boolean(t.tracker)} onChange={(v) => void run('tracker', () => p.onSetTracker(v))} />
            <FormField label="Find a ticket" helper="Its number or words from its subject">
              <span className="yx-ops-row">
                <TextField size="sm" value={find} onChange={setFind} onKeyDown={(e) => e.key === 'Enter' && find.trim() && search()} />
                <Button size="sm" disabled={!find.trim()} loading={busy === 'find'} onClick={search}>
                  Find
                </Button>
              </span>
            </FormField>
            {found.length > 0 && (
              <>
                <Segment
                  label="Link as"
                  options={[
                    { value: 'related', label: 'Related' },
                    { value: 'blocks', label: 'Blocks' },
                    { value: 'caused_by', label: 'Caused by' },
                    { value: 'tracked_by', label: 'Tracked by' },
                  ]}
                  value={kind}
                  onChange={setKind}
                />
                <ul className="yx-ops-list" aria-label="Tickets found">
                  {found.slice(0, 6).map((f) => (
                    <li key={f.id} className="yx-ops-list__item">
                      <span className="yx-ops-list__main">
                        <span>
                          {f.number} · {f.subject}
                        </span>
                      </span>
                      <span className="yx-ops-row">
                        <Button size="sm" icon={Link2} loading={busy === `l-${f.id}`} onClick={() => void run(`l-${f.id}`, async () => { await p.onLink(f.id, kind); setFound([]); setFind(''); })}>
                          Link
                        </Button>
                        <Button size="sm" loading={busy === `p-${f.id}`} onClick={() => void run(`p-${f.id}`, async () => { await p.onSetParent(f.id); setFound([]); })}>
                          Make it the parent
                        </Button>
                        {w?.canMerge && (
                          <Button size="sm" icon={GitMerge} onClick={() => setMergeTo(f)}>
                            Merge into it
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <span className="yx-ops-row">
              {w?.parent && (
                <Button size="sm" loading={busy === 'unparent'} onClick={() => void run('unparent', () => p.onSetParent(null))}>
                  Not a child any more
                </Button>
              )}
              <Button size="sm" icon={Scissors} onClick={() => setSplitOpen(true)}>
                Split into a new ticket
              </Button>
            </span>
          </>
        )}
      </div>
      <Dialog
        open={mergeTo !== null}
        onOpenChange={(o) => !o && setMergeTo(null)}
        title={mergeTo ? `Merge ${t.number} into ${mergeTo.number}?` : 'Merge'}
        description="Both conversations stay on the ticket you merge into. This ticket closes and its requester is told where to follow. This cannot be undone."
        footer={
          <>
            <Button onClick={() => setMergeTo(null)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'merge'} onClick={() => void run('merge', async () => { await p.onMerge(mergeTo!.id); setMergeTo(null); })}>
              Merge
            </Button>
          </>
        }
      />
      <SplitDialog open={splitOpen} onOpenChange={setSplitOpen} ticket={t} onSplit={async (i) => { const n = await p.onSplit(i); p.onOpenTicket(n.id); }} />
    </Card>
  );
}

function SplitDialog({ open, onOpenChange, ticket, onSplit }: { open: boolean; onOpenChange: (o: boolean) => void; ticket: TicketDetail; onSplit: (i: { messageId?: string; subject: string }) => Promise<void> }) {
  const replies = ticket.messages.filter((m) => m.kind === 'reply' && !m.fromTicketId);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const { busy, error, run } = useRun();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Split into a new ticket"
      description="A new ticket for the same requester, linked to this one, with its own response targets. Only messages the requester already saw can be used; internal notes never can."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!messageId || !subject.trim()} loading={busy === 'split'} onClick={() => void run('split', async () => { await onSplit({ messageId: messageId!, subject: subject.trim() }); onOpenChange(false); })}>
            Make the new ticket
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <FormField label="Start from this message" required>
          <Select value={messageId} onChange={setMessageId} options={replies.map((m) => ({ value: m.id, label: `${m.author} · ${when(m.createdAt)}`, description: m.bodyHtml.replace(/<[^>]*>/g, ' ').slice(0, 80) }))} />
        </FormField>
        <FormField label="Subject of the new ticket" required>
          <TextField value={subject} onChange={setSubject} maxLength={200} />
        </FormField>
      </div>
    </Dialog>
  );
}

/** US-G-005: internal threads and child tickets to other teams. The requester never sees them (YX-SD-13). */
export function SideCard(p: Pick<TicketWorkProps, 'ticket' | 'work' | 'desks' | 'onStartSide' | 'onSideMessage' | 'onCloseSide' | 'onOpenTicket'>) {
  const { busy, error, run } = useRun();
  const [channel, setChannel] = useState<'note_thread' | 'child_ticket'>('note_thread');
  const [subject, setSubject] = useState('');
  const [withWhom, setWithWhom] = useState('');
  const [deskId, setDeskId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<Record<string, string>>({});
  const t = p.ticket;
  const threads = p.work?.sideConversations ?? [];
  const canWrite = t.canWork || t.canNote;
  return (
    <Card title="Side conversations">
      <div className="yx-ops-stack" data-gap="sm">
        <p className="yx-ops-muted">Talk with another team without the requester seeing it. Email and Teams threads come later.</p>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {threads.map((s) => (
          <div key={s.id} className="yx-ops-stack" data-gap="sm">
            <span className="yx-ops-row">
              <MessagesSquare aria-hidden size={14} />
              <strong>{s.subject}</strong>
              {s.withWhom && <span className="yx-ops-muted">with {s.withWhom}</span>}
              <Badge tone={s.state === 'open' ? 'info' : 'neutral'}>{s.state === 'open' ? 'Open' : 'Closed'}</Badge>
            </span>
            {s.childTicket && (
              <button type="button" className="yx-desk-link" onClick={() => p.onOpenTicket(s.childTicket!.id)}>
                Child ticket {s.childTicket.number} · {STATE_LABEL[s.childTicket.systemState]}
              </button>
            )}
            {s.messages.map((m) => (
              <div key={m.id} className="yx-ops-msg" data-kind="note">
                <span className="yx-ops-msg__meta">
                  <span className="yx-ops-msg__who">{m.author}</span>
                  <span>{when(m.createdAt)}</span>
                </span>
                <MessageBody html={m.bodyHtml} />
              </div>
            ))}
            {s.channel === 'note_thread' && s.state === 'open' && canWrite && (
              <span className="yx-ops-row">
                <TextField size="sm" aria-label={`Write in ${s.subject}`} value={reply[s.id] ?? ''} onChange={(v) => setReply({ ...reply, [s.id]: v })} />
                <Button size="sm" disabled={!(reply[s.id] ?? '').trim()} loading={busy === `m-${s.id}`} onClick={() => void run(`m-${s.id}`, async () => { await p.onSideMessage(s.id, html(reply[s.id].trim())); setReply({ ...reply, [s.id]: '' }); })}>
                  Send
                </Button>
                {t.canWork && (
                  <Button size="sm" loading={busy === `c-${s.id}`} onClick={() => void run(`c-${s.id}`, () => p.onCloseSide(s.id))}>
                    Close thread
                  </Button>
                )}
              </span>
            )}
          </div>
        ))}
        {t.canWork && (
          <>
            <Segment label="Start" options={[{ value: 'note_thread', label: 'Internal thread' }, { value: 'child_ticket', label: 'Ask another team' }]} value={channel} onChange={setChannel} />
            <FormField label="Subject" required>
              <TextField size="sm" value={subject} onChange={setSubject} maxLength={200} />
            </FormField>
            {channel === 'note_thread' ? (
              <FormField label="With whom" optional>
                <TextField size="sm" value={withWhom} onChange={setWithWhom} maxLength={200} placeholder="e.g. Network team" />
              </FormField>
            ) : (
              <FormField label="Team (desk)" required helper="A child ticket is raised there with you as its requester.">
                <Select size="sm" value={deskId} onChange={setDeskId} options={p.desks.filter((d) => d.audience === 'employee' && d.status === 'active').map((d) => ({ value: d.id, label: d.name }))} />
              </FormField>
            )}
            <FormField label="Message" required>
              <TextArea value={text} onChange={setText} rows={3} maxLength={20000} />
            </FormField>
            <div className="yx-ops-row">
              <Button
                size="sm"
                disabled={!subject.trim() || !text.trim() || (channel === 'child_ticket' && !deskId)}
                loading={busy === 'start'}
                onClick={() =>
                  void run('start', async () => {
                    await p.onStartSide({ channel, subject: subject.trim(), bodyHtml: html(text.trim()), ...(channel === 'note_thread' && withWhom.trim() ? { withWhom: withWhom.trim() } : {}), ...(channel === 'child_ticket' ? { deskId: deskId! } : {}) });
                    setSubject('');
                    setText('');
                    setWithWhom('');
                  })
                }
              >
                {channel === 'note_thread' ? 'Start thread' : 'Raise child ticket'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/** US-G-009: my reminders on this ticket and snooze. */
export function RemindCard(p: Pick<TicketWorkProps, 'work' | 'onRemind' | 'onSnooze' | 'onDoneReminder'>) {
  const { busy, error, run } = useRun();
  const [at, setAt] = useState(localInput(new Date(Date.now() + 3_600_000)));
  const [note, setNote] = useState('');
  const mine = p.work?.reminders ?? [];
  return (
    <Card title="Remind me">
      <div className="yx-ops-stack" data-gap="sm">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {mine.map((r) => (
          <span key={r.id} className="yx-ops-row">
            {r.kind === 'snooze' ? <Moon aria-hidden size={14} /> : <BellRing aria-hidden size={14} />}
            <span>
              {r.kind === 'snooze' ? 'Snoozed until' : 'Reminder at'} {when(r.remindAt)}
              {r.note && r.kind !== 'snooze' ? ` · ${r.note}` : ''}
            </span>
            <Button size="sm" loading={busy === `d-${r.id}`} onClick={() => void run(`d-${r.id}`, () => p.onDoneReminder(r.id))}>
              {r.kind === 'snooze' ? 'Wake now' : 'Done'}
            </Button>
          </span>
        ))}
        <FormField label="When">
          <TextField size="sm" type="datetime-local" value={at} onChange={setAt} />
        </FormField>
        <FormField label="Note" optional>
          <TextField size="sm" value={note} onChange={setNote} maxLength={300} />
        </FormField>
        <span className="yx-ops-row">
          <Button size="sm" icon={BellRing} disabled={!at} loading={busy === 'remind'} onClick={() => void run('remind', async () => { await p.onRemind(new Date(at).toISOString(), note.trim()); setNote(''); })}>
            Remind me
          </Button>
          <Button size="sm" icon={Moon} disabled={!at} loading={busy === 'snooze'} onClick={() => void run('snooze', () => p.onSnooze(new Date(at).toISOString()))}>
            Snooze until then
          </Button>
        </span>
        <p className="yx-ops-muted">Snoozed tickets leave your list and come back by themselves.</p>
      </div>
    </Card>
  );
}

/** YX-SD-15: personal data hidden in the text; showing one needs the right and a second-factor check, and is recorded. */
export function MaskedCard({ work, onUnmask }: Pick<TicketWorkProps, 'work' | 'onUnmask'>) {
  const { busy, error, run } = useRun();
  const [shown, setShown] = useState<Record<string, string>>({});
  if (!work?.maskedValues.length) return null;
  return (
    <Card title="Hidden personal data">
      <div className="yx-ops-stack" data-gap="sm">
        <p className="yx-ops-muted">ID numbers, card and bank details, passwords and health words are hidden on save.</p>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {work.maskedValues.map((v) => (
          <span key={v.id} className="yx-ops-row">
            <span className="yx-ops-mono">{shown[v.id] ?? v.masked}</span>
            {work.canUnmask && !shown[v.id] && (
              <Button size="sm" icon={Eye} loading={busy === v.id} onClick={() => void run(v.id, async () => setShown({ ...shown, [v.id]: await onUnmask(v.id) }))}>
                Show (recorded)
              </Button>
            )}
          </span>
        ))}
      </div>
    </Card>
  );
}

/** The rail cards of batch 2, in the order agents use them. */
export function TicketWorkRail(p: TicketWorkProps) {
  if (!p.work) return null;
  return (
    <>
      <SlaCard work={p.work} canWork={p.ticket.canWork} onBreachReason={p.onBreachReason} onExclude={p.onExclude} />
      <TasksCard {...p} />
      <FamilyCard {...p} />
      <SideCard {...p} />
      {(p.ticket.access === 'agent' || p.ticket.access === 'collaborator') && <RemindCard {...p} />}
      <MaskedCard work={p.work} onUnmask={p.onUnmask} />
    </>
  );
}

/** YX-SD-11: resolving with a code and note when the desk asks; a tracker's message to its linked tickets. */
export function ResolveDialog({ open, onOpenChange, ticket, codes, required, linked, onResolve }: { open: boolean; onOpenChange: (o: boolean) => void; ticket: TicketDetail; codes: DeskTemplates['resolutionCodes']; required: boolean; linked: number; onResolve: (i: { resolutionCode?: string; resolutionNote?: string; linkedReplyHtml?: string }) => Promise<void> }) {
  const [code, setCode] = useState<string | null>(ticket.resolutionCode ?? null);
  const [note, setNote] = useState(ticket.resolutionNote ?? '');
  const [message, setMessage] = useState('');
  const { busy, error, run } = useRun();
  const active = codes.filter((c) => c.active);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Resolve ${ticket.number}`}
      description={required ? 'This desk asks for a resolution code and a short note.' : 'Say how it was solved; reports count tickets by code.'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={required && (!code || !note.trim())}
            loading={busy === 'resolve'}
            onClick={() => void run('resolve', async () => { await onResolve({ ...(code ? { resolutionCode: code } : {}), ...(note.trim() ? { resolutionNote: note.trim() } : {}), ...(message.trim() ? { linkedReplyHtml: html(message.trim()) } : {}) }); onOpenChange(false); })}
          >
            Resolve
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <FormField label="Resolution code" required={required} optional={!required}>
          {active.length ? <Select value={code} onChange={setCode} clearable={!required} options={active.map((c) => ({ value: c.code, label: c.label }))} /> : <p className="yx-ops-muted">This desk has no codes yet.</p>}
        </FormField>
        <FormField label="What fixed it" required={required} optional={!required}>
          <TextArea value={note} onChange={setNote} rows={3} maxLength={2000} />
        </FormField>
        {ticket.tracker && linked > 0 && (
          <FormField label={`Message to the ${linked} linked ticket${linked > 1 ? 's' : ''}`} optional helper="Each one gets this reply and is solved; a reply from them reopens it.">
            <TextArea value={message} onChange={setMessage} rows={3} maxLength={20000} placeholder="The problem you reported is fixed." />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}

/** YX-SD-12: L1 → L2 → L3 with a reason, optionally to a group of that level. */
export function EscalateDialog({ open, onOpenChange, ticket, detail, onEscalate }: { open: boolean; onOpenChange: (o: boolean) => void; ticket: TicketDetail; detail: DeskDetail; onEscalate: (i: { tier: string; groupId?: string; reason: string }) => Promise<void> }) {
  const [tier, setTier] = useState<'L1' | 'L2' | 'L3'>(ticket.tier === 'L1' ? 'L2' : 'L3');
  const [group, setGroup] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const groups = detail.groups.filter((g) => g.active && (!g.tier || g.tier === tier));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Move ${ticket.number} to another support level`}
      description={`Now at ${ticket.tier ?? 'L1'}. The move, its time and your reason go on the timeline.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={reason.trim().length < 3} loading={busy === 'esc'} onClick={() => void run('esc', async () => { await onEscalate({ tier, ...(group ? { groupId: group } : {}), reason: reason.trim() }); onOpenChange(false); })}>
            Move to {tier}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <FormField label="Support level">
          <Segment label="Support level" options={[{ value: 'L1', label: 'L1' }, { value: 'L2', label: 'L2' }, { value: 'L3', label: 'L3' }]} value={tier} onChange={setTier} />
        </FormField>
        <FormField label="Hand to group" optional>
          <Select value={group} onChange={setGroup} clearable options={groups.map((g) => ({ value: g.id, label: g.name }))} placeholder="Keep the group" />
        </FormField>
        <FormField label="Reason" required>
          <TextField value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}

/** Desk tasks list (US-G-006): my tasks and standalone tasks of my desks. */
export function TaskListCard({ tasks, onOpenTicket }: { tasks: TaskView[]; onOpenTicket: (id: string) => void }) {
  return (
    <Card title="My tasks">
      {tasks.length === 0 ? (
        <EmptyState compact title="No open tasks." />
      ) : (
        <ul className="yx-ops-list" aria-label="My tasks">
          {tasks.map((k) => (
            <li key={k.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span>{k.title}</span>
                <span className="yx-ops-list__sub">
                  {k.ticket ? (
                    <button type="button" className="yx-desk-link" onClick={() => onOpenTicket(k.ticket!.id)}>
                      {k.ticket.number}
                      {k.ticket.subject ? ` · ${k.ticket.subject}` : ''}
                    </button>
                  ) : (
                    'No ticket'
                  )}
                  {k.dueAt ? ` · due ${when(k.dueAt)}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
