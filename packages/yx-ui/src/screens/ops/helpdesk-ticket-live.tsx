// HLP-03 Ticket workspace, live (Helpdesk design wiring, round 3): the designed TicketWorkspaceScreen in helpdesk.tsx
// renders this when the page passes `live`. The design's layout (the header with status, priority, the resolution
// target, Wait on employee / Resume and Resolve; the waiting and resolved notes; Conversation and Respond; the rail with
// Requester, Details, related articles and Activity) with the real ticket, plus what the old workspace had: mentions,
// files, the status after a reply, saved replies and articles to insert, who else is on the ticket, the source, people
// on it, time, and the side cards (request and approvals, move / share / documents / follow-ups, articles, related
// tickets, tasks, side conversations, targets, reminders) passed in as `rail`. Collaborators get notes only; a desk
// admin's view is read-only. Every action is checked again on the server.
import { type ReactNode, useEffect, useState } from 'react';
import { Lock, MessageSquare, Send, Ticket as TicketIcon } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { FileUpload } from '../../components/upload';
import { RichTextEditor, STYLE_TOOLS } from '../../components/editor';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/menu';
import { Card, ObjectHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { ActivityFeed, type ActivityEntry } from '../../components/timeline';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody, PriorityBadge, STATE_LABEL, StatusBadge, TicketFlags, fillCanned, when } from '../desk/desk-kit';
import { FileList } from '../desk/help';
import { InsertArticleButton, articleLinkHtml, type ArticleOption } from '../desk/ticket-kb';
import { ConvertDialog, PeoplePanel, PriorityDialog, RequesterPanel, SourceCard, TagEditor, TimePanel, eventText } from '../desk/ticket';
import type { Attachment, CannedResponse, DeskDetail, LoadState, Person, Presence, RequesterContext, TicketChange, TicketDetail, TicketWork, TimelineEntry } from '../desk/types';
import { OpsDesk, SlaBadge, Workspace, useSay } from './ops-kit';

export interface LiveTicket {
  state: LoadState;
  onRetry: () => void;
  ticket: TicketDetail | null;
  detail: DeskDetail | null;
  /** Response targets come from here (business time used of each target). */
  work: TicketWork | null;
  canned: CannedResponse[];
  timeline: TimelineEntry[];
  context: RequesterContext | null;
  others: Presence[];
  meName: string;
  meId: string;
  onUpdate: (change: TicketChange) => Promise<void>;
  onAssign: (userId: string | null) => Promise<void>;
  onPost: (m: { kind: 'reply' | 'note'; bodyHtml: string; mentions: string[]; attachmentIds: string[]; statusId?: string }) => Promise<void>;
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
  /** Opens the resolve dialog (resolution code and note). */
  onResolveClick: () => void;
  /** Opens the support-level dialog (L1 / L2 / L3). */
  onEscalateClick: () => void;
  onFindArticle?: (q: string) => Promise<ArticleOption[]>;
  onArticleInserted?: (articleId: string) => void;
  /** The side cards under the design's rail: related articles, request and approvals, move and share, related tickets… */
  rail?: ReactNode;
  /** The desk's auto-close days, for the resolved note when the server sends no date. */
  autoCloseDays?: number | null;
}

const empty = (html: string) => !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
const minutes = (s: number) => Math.round(s / 60);

/** The timeline as the design's activity feed. */
export function activityOf(timeline: TimelineEntry[]): ActivityEntry[] {
  return [...timeline].reverse().map((e) => ({ id: e.id, kind: 'change' as const, actor: e.by ? { name: e.by } : null, at: new Date(e.at), text: `${eventText(e)}${e.reason ? `: ${e.reason}` : ''}` }));
}

export function LiveTicketWorkspace({ live }: { live: LiveTicket }) {
  const t = live.ticket;
  const d = live.detail;
  const { busy, error, run } = useRun();
  const { toast } = useSay();
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
  useEffect(() => live.onTyping(!empty(draft)), [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = (t?.requester?.name ?? '').split(' ')[0] || 'the requester';
  const sendEarly = useTooEarly(empty(draft) ? [{ fieldId: 'tk-draft', message: mode === 'note' ? 'Write the note first.' : `Write your reply to ${first} first.` }] : []);

  if (!t || !d)
    return (
      <OpsDesk area="helpdesk" active="Tickets">
        <DeskPage state={live.state === 'ready' ? 'loading' : live.state} onRetry={live.onRetry} what="this ticket">
          {null}
        </DeskPage>
      </OpsDesk>
    );

  const statuses = d.statuses.filter((s) => s.active && (!s.ticketTypeId || s.ticketTypeId === t.typeId));
  const agents = d.members.filter((m) => m.active && (m.role === 'agent' || m.role === 'lead'));
  const mentionable = d.members.filter((m) => m.active && m.userId !== live.meId);
  const collaborators = d.members.filter((m) => m.active && m.role === 'collaborator' && !t.collaborators.some((c) => c.userId === m.userId));
  const work = t.canWork;
  const done = t.systemState === 'solved' || t.systemState === 'closed';
  const paused = t.systemState === 'pending';
  const waitStatus = statuses.find((s) => s.systemState === 'pending');
  const openStatus = statuses.find((s) => s.systemState === 'open');
  const unsent = t.attachments.filter((a) => !a.messageId);
  const byMessage = new Map<string, Attachment[]>();
  for (const a of t.attachments) if (a.messageId) byMessage.set(a.messageId, [...(byMessage.get(a.messageId) ?? []), a]);
  const typing = live.others.filter((o) => o.typing);
  const timer = (metric: string) => live.work?.sla.find((x) => x.kind === 'sla' && x.metric === metric && x.state !== 'cancelled');
  const resolution = timer('resolution');
  const response = timer('first_response');
  const update = (c: TicketChange, said?: string) =>
    void run('update', async () => {
      await live.onUpdate(c);
      if (said) toast({ tone: 'success', title: said });
    });
  const closesOn = t.closesOn ?? (t.resolvedAt && live.autoCloseDays ? new Date(new Date(t.resolvedAt).getTime() + live.autoCloseDays * 86_400_000).toISOString() : null);

  const send = () =>
    !sendEarly.stop() &&
    void run('send', async () => {
      await live.onPost({ kind: mode, bodyHtml: draft, mentions: mode === 'note' ? mentions : [], attachmentIds: files.map((f) => f.id), statusId: mode === 'reply' ? (after ?? undefined) : undefined });
      toast({ tone: 'success', title: mode === 'note' ? 'Note added. Only colleagues see it.' : `Reply sent to ${first}.` });
      setDraft('');
      setMentions([]);
      setFiles([]);
      setAfter(null);
      setEditorKey((k) => k + 1);
    });

  return (
    <OpsDesk area="helpdesk" active="Tickets">
      <ObjectHeader
        name={t.subject}
        icon={TicketIcon}
        secondary={
          <span>
            <span className="yx-ops-mono">{t.number}</span> · {t.desk.name} queue{t.category ? ` · ${t.category.name}` : ''} · raised {formatDate(new Date(t.createdAt))} via {t.channel}
          </span>
        }
        status={
          <>
            <StatusBadge label={t.status?.label ?? ''} state={t.systemState} />
            <PriorityBadge priority={t.priority} />
            {t.sensitive && (
              <Badge tone="neutral">
                <Lock aria-hidden size={12} /> Sensitive: {t.desk.name} agents only
              </Badge>
            )}
            <TicketFlags private={t.private} vip={t.vip} />
            {!done && resolution && <SlaBadge label="Resolution" elapsedMin={minutes(resolution.usedSeconds)} targetMin={minutes(resolution.targetSeconds)} paused={resolution.state === 'paused'} atRiskPercent={resolution.atRiskPercent} />}
            {t.tier && <Badge tone="neutral">Level {t.tier}</Badge>}
            {t.tracker && <Badge tone="info">Tracker</Badge>}
            {t.access === 'observer' && <Badge tone="neutral">Read-only: you set this desk up</Badge>}
            {t.access === 'collaborator' && <Badge tone="neutral">You are a collaborator: notes only</Badge>}
          </>
        }
        actions={
          work ? (
            <>
              {t.assigneeUserId !== live.meId && (
                <Button loading={busy === 'take'} onClick={() => void run('take', async () => (await live.onAssign(live.meId), toast({ tone: 'success', title: `${t.number} is now yours.` })))}>
                  Assign to me
                </Button>
              )}
              {!done &&
                (paused ? (
                  <Button onClick={() => (openStatus ? update({ statusId: openStatus.id }, 'The clock runs again.') : toast({ title: `${t.desk.name} has no open status. Add one in Desk set-up.` }))}>Resume</Button>
                ) : (
                  <Button onClick={() => (waitStatus ? update({ statusId: waitStatus.id }, `Waiting on ${first}. The clock is paused.`) : toast({ title: `${t.desk.name} has no "waiting" status. Add one in Desk set-up.` }))}>Wait on employee</Button>
                ))}
              <Button variant="primary" onClick={() => (done ? toast({ title: 'This ticket is already resolved.' }) : live.onResolveClick())}>
                Resolve
              </Button>
            </>
          ) : undefined
        }
        menu={
          work ? (
            <>
              <MenuItem onSelect={() => setConvertOpen(true)}>Change ticket type</MenuItem>
              <MenuItem onSelect={live.onEscalateClick}>Move to another support level</MenuItem>
              {d.scenarios
                .filter((s) => s.active)
                .map((s) => (
                  <MenuItem key={s.id} onSelect={() => void run('scenario', async () => (await live.onRunScenario(s.id), toast({ tone: 'success', title: `“${s.name}” done.` })))}>
                    Run “{s.name}”
                  </MenuItem>
                ))}
            </>
          ) : undefined
        }
      />
      {paused && <InlineAlert tone="info">The response clock is paused while you wait for {first}. It restarts when they reply.</InlineAlert>}
      {done && (
        <InlineAlert tone="info" title={t.systemState === 'closed' ? 'Closed' : 'Resolved'}>
          {t.systemState === 'solved' && closesOn ? `Closes on ${formatDate(new Date(closesOn))} if ${first} doesn't reply. ` : ''}
          {t.rating ? `${first} rated this ticket ${t.rating} of 5.` : `${first} has not rated it yet.`}
        </InlineAlert>
      )}
      {live.others.length > 0 && (
        <InlineAlert tone="warning" title={typing.length ? `${typing.map((o) => o.name).join(', ')} ${typing.length > 1 ? 'are' : 'is'} writing on this ticket` : `${live.others.map((o) => o.name).join(', ')} ${live.others.length > 1 ? 'are' : 'is'} also on this ticket`}>
          Check before you reply so the requester is not answered twice.
        </InlineAlert>
      )}
      {t.senderVerified === false && (
        <InlineAlert tone="warning" title="Sender not verified">
          We could not prove who sent this email. Do not share private details until you are sure.
        </InlineAlert>
      )}
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <Workspace
        main={
          <>
            <Card title="Conversation">
              <ol className="yx-ops-conv" aria-label="Conversation">
                {t.messages.map((m) => (
                  <li key={m.id} className="yx-ops-msg" data-kind={m.kind === 'note' ? 'note' : m.side === 'agent' ? 'mine' : undefined}>
                    <span className="yx-ops-msg__meta">
                      <span className="yx-ops-msg__who">{m.author}</span>
                      {m.kind === 'note' && <Badge tone="warning">Internal note, not visible to {first}</Badge>}
                      {m.fromTicketId && <Badge tone="neutral">From a merged ticket</Badge>}
                      {m.senderVerified === false && <Badge tone="warning">Not verified</Badge>}
                      <span>{when(m.createdAt)}</span>
                      {m.editedAt && <span>· edited</span>}
                    </span>
                    <MessageBody html={m.bodyHtml} />
                    <FileList files={byMessage.get(m.id) ?? []} onOpen={(id) => void run(`file-${id}`, () => live.onOpenFile(id))} />
                  </li>
                ))}
              </ol>
              <FileList files={unsent} onOpen={(id) => void run(`file-${id}`, () => live.onOpenFile(id))} title="Files not sent yet (internal)" />
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
                      {mode === 'note' && <p className="yx-ops-muted">Only people working the {t.desk.name} queue and the ticket’s collaborators see internal notes.</p>}
                      <FormField id="tk-draft" label={mode === 'note' ? 'Note' : 'Reply'} hideLabel error={sendEarly.errorOf('tk-draft')}>
                        <RichTextEditor hide={STYLE_TOOLS} key={editorKey} value={draft} onChange={setDraft} mergeFields={[]} placeholder={mode === 'note' ? 'Add a note for other agents' : `Write to ${first}`} />
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
                            const a = await live.onUpload(file);
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
                        {work && live.canned.length > 0 && (
                          <Menu>
                            <MenuTrigger asChild>
                              <Button icon={MessageSquare}>Insert saved reply</Button>
                            </MenuTrigger>
                            <MenuContent>
                              {live.canned
                                .filter((c) => c.active)
                                .map((c) => (
                                  <MenuItem key={c.id} onSelect={() => setDraft((x) => `${x}${fillCanned(c.bodyHtml, { firstName: first, number: t.number, agent: live.meName })}`)}>
                                    {c.title}
                                    {c.personal ? ' (mine)' : ''}
                                  </MenuItem>
                                ))}
                            </MenuContent>
                          </Menu>
                        )}
                        {work && mode === 'reply' && live.onFindArticle && (
                          <InsertArticleButton
                            onFind={live.onFindArticle}
                            onInsert={(a) => {
                              setDraft((x) => `${x}${articleLinkHtml(a)}`);
                              live.onArticleInserted?.(a.id);
                            }}
                          />
                        )}
                        <Button variant="primary" icon={Send} onClick={send} loading={busy === 'send'}>
                          {mode === 'note' ? 'Add note' : 'Send reply'}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </Card>
            )}
          </>
        }
        rail={
          <>
            <Card title="Requester">
              <RequesterPanel ticket={t} context={live.context} onOpenTicket={live.onOpenTicket} />
            </Card>
            <Card title="Details">
              <div className="yx-ops-stack">
                <FormField label="Status">
                  {work ? <Select value={t.statusId} onChange={(v) => v && update({ statusId: v })} options={statuses.map((s) => ({ value: s.id, label: s.label, description: STATE_LABEL[s.systemState] }))} /> : <StatusBadge label={t.status?.label ?? ''} state={t.systemState} />}
                </FormField>
                <FormField label="Priority">
                  {work ? <Segment label="Priority" options={[1, 2, 3, 4].map((p) => ({ value: p, label: `P${p}` }))} value={t.priority} onChange={(p) => p !== t.priority && setPriorityAsk(p)} /> : <PriorityBadge priority={t.priority} />}
                </FormField>
                <FormField label="Assignee">
                  {work ? (
                    <Select
                      value={t.assigneeUserId}
                      onChange={(v) => void run('assign', () => live.onAssign(v))}
                      clearable={t.canAssignOthers || t.assigneeUserId === live.meId}
                      options={agents.filter((m) => t.canAssignOthers || m.userId === live.meId || m.userId === t.assigneeUserId).map((m) => ({ value: m.userId, label: m.userId === live.meId ? `${m.name} (me)` : m.name }))}
                      placeholder="Unassigned"
                    />
                  ) : (
                    <span>{t.assignee?.name ?? 'Unassigned'}</span>
                  )}
                </FormField>
                <FormField label="Group">
                  {work ? <Select value={t.groupId} onChange={(v) => update({ groupId: v })} clearable options={d.groups.filter((g) => g.active).map((g) => ({ value: g.id, label: g.name }))} placeholder="No group" /> : <span>{t.group?.name ?? 'No group'}</span>}
                </FormField>
                <FormField label="Category">
                  {work ? <Select value={t.categoryId} onChange={(v) => update({ categoryId: v })} clearable options={d.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name, description: c.sensitive ? 'Sensitive: agents only' : undefined }))} placeholder="No category" /> : <span>{t.category?.name ?? 'No category'}</span>}
                </FormField>
                <FormField label="First response">
                  {t.firstResponseAt ? <Badge tone="success">Met</Badge> : response ? <SlaBadge elapsedMin={minutes(response.usedSeconds)} targetMin={minutes(response.targetSeconds)} paused={response.state === 'paused'} atRiskPercent={response.atRiskPercent} /> : <span className="yx-ops-muted">No target</span>}
                </FormField>
                <TagEditor tags={t.tags} disabled={!work} onChange={(tags) => update({ tags })} />
                {work && <Switch label="Private" description="Only this desk’s agents and the ticket’s collaborators see it." checked={t.private} onChange={(p) => update({ private: p }, p ? 'The ticket is private now.' : 'The ticket is no longer private.')} />}
              </div>
            </Card>
            {live.rail}
            <Card title="Activity">{live.timeline.length ? <ActivityFeed entries={activityOf(live.timeline)} /> : <p className="yx-ops-muted">Nothing yet.</p>}</Card>
            <SourceCard ticket={t} />
            <Card title="People on this ticket">
              <PeoplePanel
                ticket={t}
                collaborators={collaborators}
                work={work}
                busy={busy}
                onSearchPeople={live.onSearchPeople}
                onAddWatcher={(id) => void run('watch', () => live.onAddWatcher(id))}
                onRemoveWatcher={(id) => void run('unwatch', () => live.onRemoveWatcher(id))}
                onAddCollaborator={(id) => void run('collab', () => live.onAddCollaborator(id))}
                onRemoveCollaborator={(id) => void run('uncollab', () => live.onRemoveCollaborator(id))}
              />
            </Card>
            <Card title="Time spent">
              <TimePanel ticket={t} work={work} busy={busy === 'time'} onAdd={(m, n) => void run('time', async () => (await live.onAddTime(m, n), toast({ tone: 'success', title: 'Time logged.' })))} />
            </Card>
          </>
        }
      />
      <PriorityDialog value={priorityAsk} onClose={() => setPriorityAsk(null)} onSave={(p, reason) => update({ priority: p, priorityReason: reason }, `Priority changed to P${p}.`)} />
      <ConvertDialog open={convertOpen} onOpenChange={setConvertOpen} types={d.types.filter((x) => x.active && x.id !== t.typeId)} onConvert={(typeId, reason) => void run('convert', async () => (await live.onConvert(typeId, reason), toast({ tone: 'success', title: 'Ticket type changed.' })))} />
    </OpsDesk>
  );
}
