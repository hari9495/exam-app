import { useId, useState, type ReactNode } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { useToast } from '../../components/notify';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { FileUpload } from '../../components/upload';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody, StatusBadge, sizeText, when } from './desk-kit';
import { RateTicketCard, SuggestList, useSuggestions, type KbSuggestion } from './help-kb';
import { RequesterFields } from './ticket-fields';
import type { Attachment, BannerSeverity, LoadState, MyTicket, MyTicketRow, PublicBanner, RaiseDesk, RaiseInput } from './types';

// The requester's side of the desk: known-issue banners with "Me too" (US-G-020), the in-app Help drawer (US-B-100) and
// one ticket (HLP-01 My ticket). The Help centre page itself is the designed HLP-01 screen (ops/helpdesk.tsx, `live`).

const URGENCY = [
  { value: '4', label: 'Whenever' },
  { value: '3', label: 'This week' },
  { value: '2', label: 'Today' },
  { value: '1', label: 'Right now' },
] as const;

const SEVERITY: Record<BannerSeverity, { tone: 'info' | 'warning' | 'danger'; title: string }> = {
  info: { tone: 'info', title: 'For your information' },
  warning: { tone: 'warning', title: 'Known issue' },
  outage: { tone: 'danger', title: 'Service down' },
};

/** Known issues at the top of a help page (US-G-020). "Me too" follows the team's incident instead of a new ticket. */
export function BannerList({ banners, onMeToo }: { banners: PublicBanner[]; onMeToo: (id: string) => Promise<unknown> }) {
  const [joined, setJoined] = useState<string[]>([]);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  if (!banners.length) return null;
  return (
    <section className="yx-ops-stack" data-gap="sm" aria-label="Known issues">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      {banners.map((b) => {
        const on = b.meToo || joined.includes(b.id);
        // ITSM answer 2051: on a known problem, "Me too" raises the person's own ticket, already linked to it; the toast says which.
        return (
          <InlineAlert
            key={b.id}
            tone={SEVERITY[b.severity].tone}
            title={SEVERITY[b.severity].title}
            actions={
              b.canMeToo ? (
                <Button size="sm" loading={busy === b.id} onClick={() => (on ? toast({ title: 'You are already on this issue. You will hear when it is fixed.' }) : void run(b.id, async () => { const res = (await onMeToo(b.id)) as { ticket?: { number: string } } | undefined; setJoined((j) => [...j, b.id]); toast({ tone: 'success', title: res?.ticket ? `We raised ${res.ticket.number} for you` : 'You are on this issue', description: res?.ticket ? 'It is linked to this issue. You will hear when it is fixed.' : 'You will hear when it is fixed.' }); }))}>
                  {on ? 'You are on it' : 'Me too'}
                </Button>
              ) : undefined
            }
          >
            {b.text}
          </InlineAlert>
        );
      })}
    </section>
  );
}

/** The raise-a-ticket fields, shared by the Help centre and the in-app Help drawer. Articles are suggested while typing. */
function useRaiseForm(desks: RaiseDesk[], suggest?: { onSuggest?: (q: string) => Promise<KbSuggestion[]>; onOpen?: (a: KbSuggestion) => void; hrefOf?: (a: KbSuggestion) => string }) {
  const [deskId, setDeskId] = useState<string | null>(desks.length === 1 ? desks[0].id : null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [urgency, setUrgency] = useState<string>('3');
  const [isPrivate, setPrivate] = useState(false);
  const desk = desks.find((d) => d.id === deskId);
  const category = desk?.categories.find((c) => c.id === categoryId);
  const suggestions = useSuggestions(`${subject} ${details.slice(0, 200)}`, suggest?.onSuggest);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const early = useTooEarly([
    ...(deskId ? [] : [{ fieldId: id('desk'), message: 'Choose a team.' }]),
    ...(subject.trim() ? [] : [{ fieldId: id('subject'), message: 'Write a subject.' }]),
    ...(details.trim() ? [] : [{ fieldId: id('details'), message: 'Add the details.' }]),
  ]);
  const fields = (
    <>
      <FormField id={id('desk')} label="Which team?" required error={early.errorOf(id('desk'))}>
        <Select
          value={deskId}
          onChange={(v) => {
            setDeskId(v);
            setCategoryId(null);
            setTypeId(null);
          }}
          options={desks.map((d) => ({ value: d.id, label: d.name }))}
          placeholder="Choose a team"
        />
      </FormField>
      {desk && (
        <>
          <FormField label="What is it about?" optional>
            <Select
              value={categoryId}
              onChange={setCategoryId}
              clearable
              options={desk.categories.map((c) => ({ value: c.id, label: c.parentId ? `· ${c.name}` : c.name, description: c.sensitive ? 'Private: only this team’s agents see it' : undefined }))}
              placeholder="Choose a topic"
            />
          </FormField>
          {desk.types.length > 1 && (
            <FormField label="Kind of ticket" optional>
              <Select value={typeId} onChange={setTypeId} clearable options={desk.types.map((t) => ({ value: t.id, label: t.name }))} placeholder="Choose a kind" />
            </FormField>
          )}
        </>
      )}
      <FormField id={id('subject')} error={early.errorOf(id('subject'))} label="Subject" required helper="One line, e.g. “VPN drops when I work from home”">
        <TextField value={subject} onChange={setSubject} maxLength={200} />
      </FormField>
      <SuggestList items={suggestions} onOpen={suggest?.onOpen} hrefOf={suggest?.hrefOf} />
      <FormField id={id('details')} error={early.errorOf(id('details'))} label="Details" required helper="Add dates, error messages or steps so the team can help faster. You can add files after raising it.">
        <TextArea value={details} onChange={setDetails} rows={5} maxLength={20000} />
      </FormField>
      <FormField label="How soon do you need it?">
        <Segment label="How soon do you need it?" options={URGENCY.map((u) => ({ value: u.value, label: u.label }))} value={urgency} onChange={setUrgency} />
      </FormField>
      {category?.sensitive ? (
        <InlineAlert tone="info" title="Private by default">
          Only this team’s agents can see tickets about {category.name.toLowerCase()}.
        </InlineAlert>
      ) : (
        <Checkbox checked={isPrivate} onChange={setPrivate} label="Keep this private" description="Only the team's agents can see it, not their admins." />
      )}
    </>
  );
  return {
    fields,
    /** Pressed too early: the missing fields say so and the first takes focus. */
    stop: early.stop,
    dirty: Boolean(subject || details),
    input: (): RaiseInput => ({ deskId: deskId!, categoryId: categoryId ?? undefined, typeId: typeId ?? undefined, subject: subject.trim(), description: details.trim(), impact: 3, urgency: Number(urgency), private: isPrivate || undefined }),
    clear: () => {
      setSubject('');
      setDetails('');
      setPrivate(false);
    },
  };
}

export type HelpTab = 'page' | 'assistant' | 'ask' | 'new' | 'tours';

export interface HelpDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  desks: RaiseDesk[];
  tickets: MyTicketRow[];
  banners: PublicBanner[];
  onMeToo: (id: string) => Promise<unknown>;
  /** The page adds the screen the drawer was opened on. */
  onRaise: (input: RaiseInput) => Promise<{ id: string; number: string }>;
  ticketHref: (id: string) => string;
  /** Batch 4: articles suggested while typing; they open in the Help centre in a new tab. */
  onSuggest?: (q: string) => Promise<KbSuggestion[]>;
  articleHref?: (a: KbSuggestion) => string;
  /**
   * Help H-1 (answer 942): "This page": help articles tagged with the page. Null or left out hides the tab (the company
   * turned page help off).
   */
  pageHelp?: { state: 'loading' | 'ready' | 'error'; articles: KbSuggestion[] } | null;
  /** Answers 943 and 944: the What's new and Tours tabs, shown only when their content is given (H-4, H-5). */
  whatsNew?: ReactNode;
  tours?: ReactNode;
  /** Ask YukthiX (answers 2101 to 2108): the help assistant's tab, shown when given. */
  assistant?: ReactNode;
  /** The tab it opens on: This page when it has articles, else Ask. */
  defaultTab?: HelpTab;
}

/**
 * The one Help drawer (US-B-100, Help and onboarding 941), open from every page: known issues on top, then the tabs This
 * page (help articles for the page), Ask YukthiX (the help assistant), Ask (raise a ticket, my open tickets), What's new
 * and Tours.
 */
export function HelpDrawer(props: HelpDrawerProps) {
  const form = useRaiseForm(props.desks, { onSuggest: props.onSuggest, hrefOf: props.articleHref });
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const open = props.tickets.filter((t) => !['solved', 'closed'].includes(t.systemState));
  const page = props.pageHelp ?? null;
  const [tab, setTab] = useState<HelpTab>(props.defaultTab ?? (page && page.articles.length ? 'page' : 'ask'));
  const raise = () =>
    !form.stop() &&
    void run('raise', async () => {
      const r = await props.onRaise(form.input());
      toast({ tone: 'success', title: 'Ticket raised', description: `Your ticket number is ${r.number}. The team will reply in the Help centre.` });
      form.clear();
    });
  return (
    <Drawer
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Help"
      subtitle="Help for this page, or ask a team without leaving it."
      dirty={form.dirty}
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>Close</Button>
          {tab === 'ask' && (
            <Button variant="primary" loading={busy === 'raise'} onClick={raise}>
              Raise ticket
            </Button>
          )}
        </>
      }
    >
      <div className="yx-ops-stack">
        <BannerList banners={props.banners} onMeToo={props.onMeToo} />
        <Tabs value={tab} onValueChange={(v) => setTab(v as HelpTab)}>
          <TabsList aria-label="Help sections">
            {page && <TabsTrigger value="page">This page</TabsTrigger>}
            {props.assistant !== undefined && <TabsTrigger value="assistant">Ask YukthiX</TabsTrigger>}
            <TabsTrigger value="ask">Ask</TabsTrigger>
            {props.whatsNew !== undefined && <TabsTrigger value="new">What's new</TabsTrigger>}
            {props.tours !== undefined && <TabsTrigger value="tours">Tours</TabsTrigger>}
          </TabsList>
          {page && (
            <TabsContent value="page">
              <PageHelp page={page} hrefOf={props.articleHref} onAsk={() => setTab('ask')} />
            </TabsContent>
          )}
          <TabsContent value="ask">
            <div className="yx-ops-stack">
              {error && <InlineAlert tone="danger" title="The ticket was not raised">{error}</InlineAlert>}
              <h3 className="yx-ops-card__title">Raise a ticket</h3>
              {form.fields}
              <h3 className="yx-ops-card__title">My open tickets</h3>
              {open.length ? (
                <ul className="yx-ops-list" aria-label="My open tickets">
                  {open.map((t) => (
                    <li key={t.id} className="yx-ops-list__item">
                      <span className="yx-ops-list__main">
                        <a className="yx-desk-link" href={props.ticketHref(t.id)}>
                          {t.subject}
                        </a>
                        <span className="yx-ops-list__sub">
                          <span className="yx-ops-mono">{t.number}</span> · {t.status}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="yx-ops-muted">You have no open tickets.</p>
              )}
            </div>
          </TabsContent>
          {props.assistant !== undefined && <TabsContent value="assistant">{props.assistant}</TabsContent>}
          {props.whatsNew !== undefined && <TabsContent value="new">{props.whatsNew}</TabsContent>}
          {props.tours !== undefined && <TabsContent value="tours">{props.tours}</TabsContent>}
        </Tabs>
      </div>
    </Drawer>
  );
}

/** Help H-1: the help articles written for this page (they open in the Help centre, in a new tab). */
export function PageHelp({ page, hrefOf, onAsk }: { page: NonNullable<HelpDrawerProps['pageHelp']>; hrefOf?: (a: KbSuggestion) => string; onAsk?: () => void }) {
  if (page.state === 'loading') return <p className="yx-ops-muted" aria-busy="true">Looking for help on this page…</p>;
  if (page.state === 'error') return <InlineAlert tone="danger" title="Help for this page could not be loaded.">Try again, or ask a team.</InlineAlert>;
  if (!page.articles.length)
    return <EmptyState compact title="No help is written for this page yet." description="Ask a team, or search the Help centre." action={onAsk ? <Button onClick={onAsk}>Ask a team</Button> : undefined} />;
  return (
    <ul className="yx-ops-list" aria-label="Help for this page">
      {page.articles.map((a) => (
        <li key={a.id} className="yx-ops-list__item">
          <span className="yx-ops-list__main">
            {hrefOf ? (
              <a className="yx-desk-link" href={hrefOf(a)} target="_blank" rel="noopener noreferrer">
                {a.title}
              </a>
            ) : (
              <span>{a.title}</span>
            )}
            {a.summary && <span className="yx-ops-list__sub">{a.summary}</span>}
            {a.source === 'yukthix' && <span className="yx-ops-list__sub">From YukthiX</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------- one ticket

export interface MyTicketScreenProps {
  state: LoadState;
  onRetry?: () => void;
  ticket: MyTicket | null;
  onBack: () => void;
  onReply: (text: string, attachmentIds: string[]) => Promise<void>;
  onUpload: (file: File) => Promise<Attachment>;
  onOpenFile: (attachmentId: string) => Promise<void>;
  onAddWatcher: (email: string) => Promise<void>;
  timeZone?: string;
  /** SD-1.26: rate a solved ticket (shown when the ticket says it can be rated or was rated). */
  onRate?: (score: number, comment?: string, reason?: string) => Promise<unknown>;
  /** 3b-2: what was ordered on this request, with its stages (shown above the conversation). */
  request?: ReactNode;
}

/** The requester's view of one ticket: replies only, never the team's internal notes (YX-SD-13). */
export function MyTicketScreen(props: MyTicketScreenProps) {
  const t = props.ticket;
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploadKey, setUploadKey] = useState(0);
  const [watcher, setWatcher] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const replyEarly = useTooEarly(text.trim() ? [] : [{ fieldId: 'my-reply', message: 'Write your reply.' }]);
  const watchEarly = useTooEarly(watcher.includes('@') ? [] : [{ fieldId: 'my-watcher', message: "Enter your colleague's work email." }]);
  const byMessage = new Map<string, Attachment[]>();
  for (const a of t?.attachments ?? []) {
    const k = a.messageId ?? '';
    byMessage.set(k, [...(byMessage.get(k) ?? []), a]);
  }
  return (
    <DeskPage
      title={t ? t.subject : 'Ticket'}
      description={t ? `${t.number} · ${t.desk.name} · raised ${when(t.createdAt, props.timeZone)}${t.requestedFor ? ` for ${t.requestedFor}` : ''}` : undefined}
      state={props.state}
      onRetry={props.onRetry}
      what="this ticket"
      actions={<Button onClick={props.onBack}>Back to my tickets</Button>}
    >
      {t && (
        <div className="yx-ops-ws">
          <div className="yx-ops-ws__main">
            {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
            {props.request}
            <Card title="Conversation">
              <ol className="yx-ops-conv" aria-label="Conversation">
                {t.messages.map((m) => (
                  <li key={m.id} className="yx-ops-msg" data-kind={m.mine ? 'mine' : undefined}>
                    <span className="yx-ops-msg__meta">
                      <span className="yx-ops-msg__who">{m.mine ? 'You' : m.author}</span>
                      <span>{when(m.createdAt, props.timeZone)}</span>
                    </span>
                    <MessageBody html={m.bodyHtml} />
                    <FileList files={byMessage.get(m.id) ?? []} onOpen={(id) => void run(`file-${id}`, () => props.onOpenFile(id))} />
                  </li>
                ))}
              </ol>
              <FileList files={byMessage.get('') ?? []} onOpen={(id) => void run(`file-${id}`, () => props.onOpenFile(id))} title="Files you added" />
            </Card>
            {t.canReply ? (
              <Card title="Reply">
                <div className="yx-ops-stack">
                  {t.replyStartsFollowUp && <InlineAlert tone="info">{t.systemState === 'closed' ? 'This ticket is closed.' : 'The time to reopen this ticket has passed.'} Your reply starts a new ticket linked to this one.</InlineAlert>}
                  {!t.replyStartsFollowUp && t.systemState === 'solved' && t.reopenUntil && <p className="yx-ops-muted">Not fixed? Reply by {when(t.reopenUntil, props.timeZone)} and the ticket opens again.</p>}
                  <FormField id="my-reply" label="Your reply" hideLabel error={replyEarly.errorOf('my-reply')}>
                    <TextArea value={text} onChange={setText} rows={4} placeholder="Write to the team" maxLength={20000} />
                  </FormField>
                  <FormField label="Files" optional helper={`${t.desk.attachmentTypes.join(', ')} · up to ${t.desk.attachmentMaxMb} MB each`}>
                    <FileUpload
                      key={uploadKey}
                      accept={t.desk.attachmentTypes.map((x) => `.${x}`)}
                      maxSize={t.desk.attachmentMaxMb * 1024 * 1024}
                      upload={async (file, h) => {
                        h.onScanning();
                        const a = await props.onUpload(file);
                        setFiles((f) => [...f, a]);
                      }}
                    />
                  </FormField>
                  <div className="yx-ops-row">
                    <Button
                      variant="primary"
                      icon={Send}
                      loading={busy === 'reply'}
                      onClick={() =>
                        !replyEarly.stop() &&
                        void run('reply', async () => {
                          await props.onReply(text.trim(), files.map((f) => f.id));
                          setText('');
                          setFiles([]);
                          setUploadKey((k) => k + 1);
                        })
                      }
                    >
                      Send reply
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <InlineAlert tone="info" title={t.mergedInto ? `Joined with ${t.mergedInto}` : 'This ticket is closed'}>
                {t.mergedInto ? 'Follow that ticket for updates.' : 'Raise a new ticket if you still need help.'}
              </InlineAlert>
            )}
          </div>
          <div className="yx-ops-ws__rail">
            {(t.deskFields ?? []).length > 0 && (
            <Card title="Details">
              <RequesterFields fields={t.deskFields} />
            </Card>
          )}
          {props.onRate && (t.canRate || t.rating) && <RateTicketCard rating={t.rating ?? null} reasons={t.ratingReasons} onRate={props.onRate} />}
            <Card title="Status">
              <div className="yx-ops-stack" data-gap="sm">
                <StatusBadge label={t.status} state={t.systemState} />
                <p className="yx-ops-muted">{t.assignee ? `${t.assignee} is working on it.` : 'Waiting for someone in the team to pick it up.'}</p>
                {t.resolveBy && <p>We aim to resolve it by {when(t.resolveBy, props.timeZone)}.</p>}
                {t.targetPaused && <p className="yx-ops-muted">The team is waiting for something before it can go on.</p>}
                {t.private && <p className="yx-ops-muted">Private: only the team’s agents can see it.</p>}
                {t.history.length > 0 && (
                  <ul className="yx-ops-list" aria-label="Status changes">
                    {t.history.map((h) => (
                      <li key={h.at} className="yx-ops-list__item">
                        <span className="yx-ops-list__sub">
                          {h.to} · {when(h.at, props.timeZone)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
            {t.canReply && (
              <Card title="Keep a colleague informed">
                <div className="yx-ops-stack" data-gap="sm">
                  <FormField id="my-watcher" label="Colleague's work email" error={watchEarly.errorOf('my-watcher')}>
                    <TextField value={watcher} onChange={setWatcher} type="email" />
                  </FormField>
                  {added && <p className="yx-ops-muted">If {added} works here, they will get updates.</p>}
                  <div className="yx-ops-row">
                    <Button
                      loading={busy === 'watch'}
                      onClick={() =>
                        !watchEarly.stop() &&
                        void run('watch',
 async () => {
                          await props.onAddWatcher(watcher.trim());
                          setAdded(watcher.trim());
                          setWatcher('');
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </DeskPage>
  );
}

/** Files with their scan state: only clean files open (§14.2). */
export function FileList({ files, onOpen, title }: { files: Attachment[]; onOpen: (id: string) => void; title?: string }) {
  if (!files.length) return null;
  return (
    <div className="yx-ops-stack" data-gap="sm">
      {title && <p className="yx-ops-muted">{title}</p>}
      <ul className="yx-desk-files" aria-label={title ?? 'Files'}>
        {files.map((f) => (
          <li key={f.id}>
            {f.scanStatus === 'clean' ? (
              <Button size="sm" icon={Paperclip} onClick={() => onOpen(f.id)}>
                {f.fileName} · {sizeText(f.sizeBytes)}
              </Button>
            ) : (
              <span className="yx-ops-row">
                <Paperclip aria-hidden size={14} /> {f.fileName}{' '}
                <Badge tone={f.scanStatus === 'pending' ? 'neutral' : 'danger'}>{f.scanStatus === 'pending' ? 'Being checked for viruses' : 'Blocked: may be harmful'}</Badge>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
