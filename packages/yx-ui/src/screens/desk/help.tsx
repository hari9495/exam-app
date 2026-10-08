import { useEffect, useState } from 'react';
import { Lock, Paperclip, Plus, Send } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { FileUpload } from '../../components/upload';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody, StatusBadge, browserTimeZone, sizeText, when } from './desk-kit';
import { ReadingAidsCard, ReadingAidsFrame, useReadingAids } from './reading-aids';
import { PrivacyRequestCard, type PortalScreenProps } from './portal';
import { ArticleDrawer, KnowledgeCard, RateTicketCard, SuggestList, useSuggestions, type KbArticleView, type KbHome, type KbSuggestion } from './help-kb';
import type { Attachment, BannerSeverity, LoadState, MyTicket, MyTicketRow, PublicBanner, RaiseDesk, RaiseInput } from './types';

// HLP-01 Help centre, wired (US-B-086, US-G-004, YX-SD-16): raise a ticket with the right desk, follow my tickets.
// Batch 3: known-issue banners with "Me too" (US-G-020), reading aids, times in the person's own zone, and the in-app
// Help drawer (US-B-100). Batch 4: help articles to search and browse, suggestions while typing, "This solved it"
// (SD-1.24, US-B-105) and rating a solved ticket (SD-1.26). The assistant arrives with AI (3b-4).

export interface HelpCentreProps {
  state: LoadState;
  onRetry?: () => void;
  desks: RaiseDesk[];
  tickets: MyTicketRow[];
  onRaise: (input: RaiseInput) => Promise<{ id: string; number: string }>;
  onOpen: (id: string) => void;
  /** Known issues with "Me too". */
  banners?: PublicBanner[];
  onMeToo?: (id: string) => Promise<unknown>;
  /** The person's own time zone (IANA name); the browser's when empty. */
  timeZone?: string;
  /** Batch 4: the help articles of the company (absent: no knowledge base yet). */
  kb?: HelpKbProps;
  /** SD-1.30: a copy of my desk data, or its erasure. */
  privacy?: PortalScreenProps['privacy'];
}

export interface HelpKbProps {
  home: KbHome | null;
  onSearch: (q: string) => Promise<KbSuggestion[]>;
  onArticle: (number: number, language?: string) => Promise<KbArticleView>;
  onFeedback: (articleId: string, helpful: boolean) => Promise<unknown>;
  onSolved: (articleId: string) => Promise<unknown>;
  /** Opened from a link (?article=12). */
  openNumber?: number | null;
}

const URGENCY = [
  { value: '4', label: 'Whenever' },
  { value: '3', label: 'This week' },
  { value: '2', label: 'Today' },
  { value: '1', label: 'Right now' },
] as const;

export function HelpCentreScreen(props: HelpCentreProps) {
  const [open, setOpen] = useState(false);
  const [raised, setRaised] = useState<string | null>(null);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [aids, setAids] = useReadingAids();
  const tz = props.timeZone || browserTimeZone();
  const rows = props.tickets.filter((t) => show === 'all' || !['solved', 'closed'].includes(t.systemState));
  const [article, setArticle] = useState<KbArticleView | null>(null);
  const kb = props.kb;
  const openArticle = (n: number, lang?: string) => void kb?.onArticle(n, lang).then(setArticle, () => setArticle(null));
  useEffect(() => {
    if (kb?.openNumber) openArticle(kb.openNumber);
    // Only when the link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kb?.openNumber]);
  return (
    <ReadingAidsFrame value={aids}>
      <DeskPage
        title="Help centre"
        description="Raise a ticket with the right team and follow it here."
        state={props.state}
        onRetry={props.onRetry}
        what="your tickets"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setOpen(true)} disabled={!props.desks.length}>
            Raise a ticket
          </Button>
        }
      >
        {props.banners && props.onMeToo && <BannerList banners={props.banners} onMeToo={props.onMeToo} />}
        {raised && (
          <InlineAlert tone="success" title="Ticket raised">
            Your ticket number is {raised}. The team will reply here.
          </InlineAlert>
        )}
        {kb && <KnowledgeCard home={kb.home} onSearch={kb.onSearch} onOpen={(a) => openArticle(a.number)} />}
        <Card title="My tickets" actions={<Segment label="Which tickets" options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} value={show} onChange={setShow} />}>
          {rows.length === 0 ? (
            <EmptyState compact title={show === 'open' ? 'You have no open tickets.' : 'You have no tickets yet.'} description="When you raise a ticket, you can follow it here." />
          ) : (
            <ul className="yx-ops-list" aria-label="My tickets">
              {rows.map((t) => (
                <li key={t.id} className="yx-ops-list__item">
                  <span className="yx-ops-list__main">
                    <button type="button" className="yx-desk-link" onClick={() => props.onOpen(t.id)}>
                      {t.subject}
                    </button>
                    <span className="yx-ops-list__sub">
                      <span className="yx-ops-mono">{t.number}</span> · {t.desk} · raised {when(t.createdAt, tz)}
                      {t.role === 'requested_for' ? ' · raised for you' : t.role === 'watcher' ? ' · you follow it' : ''}
                    </span>
                  </span>
                  <span className="yx-ops-row">
                    {t.private && (
                      <Badge tone="neutral">
                        <Lock aria-hidden size={12} /> Private
                      </Badge>
                    )}
                    <StatusBadge label={t.status} state={t.systemState} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="yx-ops-muted">Times are in your time zone: {tz}.</p>
        </Card>
        <ReadingAidsCard value={aids} onChange={setAids} />
        {props.privacy && <PrivacyRequestCard {...props.privacy} />}
        {article && kb && (
          <ArticleDrawer
            open
            onOpenChange={(o) => !o && setArticle(null)}
            article={article}
            timeZone={tz}
            onLanguage={(l) => openArticle(article.number, l)}
            onFeedback={(h) => kb.onFeedback(article.id, h)}
            onSolved={() => kb.onSolved(article.id)}
            onStillNeedHelp={() => {
              setArticle(null);
              setOpen(true);
            }}
          />
        )}
        <RaiseDrawer
          open={open}
          onOpenChange={setOpen}
          onSuggest={kb?.onSearch}
          onOpenSuggestion={(a) => openArticle(a.number)}
          desks={props.desks}
          onRaise={async (input) => {
            const r = await props.onRaise(input);
            setRaised(r.number);
            setOpen(false);
          }}
        />
      </DeskPage>
    </ReadingAidsFrame>
  );
}

const SEVERITY: Record<BannerSeverity, { tone: 'info' | 'warning' | 'danger'; title: string }> = {
  info: { tone: 'info', title: 'For your information' },
  warning: { tone: 'warning', title: 'Known issue' },
  outage: { tone: 'danger', title: 'Service down' },
};

/** Known issues at the top of a help page (US-G-020). "Me too" follows the team's incident instead of a new ticket. */
export function BannerList({ banners, onMeToo }: { banners: PublicBanner[]; onMeToo: (id: string) => Promise<unknown> }) {
  const [joined, setJoined] = useState<string[]>([]);
  const { busy, error, run } = useRun();
  if (!banners.length) return null;
  return (
    <section className="yx-ops-stack" data-gap="sm" aria-label="Known issues">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      {banners.map((b) => {
        const on = b.meToo || joined.includes(b.id);
        return (
          <InlineAlert
            key={b.id}
            tone={SEVERITY[b.severity].tone}
            title={SEVERITY[b.severity].title}
            actions={
              b.canMeToo ? (
                <Button size="sm" disabled={on} loading={busy === b.id} onClick={() => void run(b.id, async () => { await onMeToo(b.id); setJoined((j) => [...j, b.id]); })}>
                  {on ? 'You are on it' : 'Me too'}
                </Button>
              ) : undefined
            }
          >
            {b.text}
            {joined.includes(b.id) && <> We added you to this issue. You will hear when it is fixed.</>}
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
  const fields = (
    <>
      <FormField label="Which team?" required>
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
      <FormField label="Subject" required helper="One line, e.g. “VPN drops when I work from home”">
        <TextField value={subject} onChange={setSubject} maxLength={200} />
      </FormField>
      <SuggestList items={suggestions} onOpen={suggest?.onOpen} hrefOf={suggest?.hrefOf} />
      <FormField label="Details" required helper="Add dates, error messages or steps so the team can help faster. You can add files after raising it.">
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
    ready: Boolean(deskId && subject.trim() && details.trim()),
    dirty: Boolean(subject || details),
    input: (): RaiseInput => ({ deskId: deskId!, categoryId: categoryId ?? undefined, typeId: typeId ?? undefined, subject: subject.trim(), description: details.trim(), impact: 3, urgency: Number(urgency), private: isPrivate || undefined }),
    clear: () => {
      setSubject('');
      setDetails('');
      setPrivate(false);
    },
  };
}

function RaiseDrawer({ open, onOpenChange, desks, onRaise, onSuggest, onOpenSuggestion }: { open: boolean; onOpenChange: (o: boolean) => void; desks: RaiseDesk[]; onRaise: (i: RaiseInput) => Promise<void>; onSuggest?: (q: string) => Promise<KbSuggestion[]>; onOpenSuggestion?: (a: KbSuggestion) => void }) {
  const form = useRaiseForm(desks, { onSuggest, onOpen: onOpenSuggestion });
  const { busy, error, run } = useRun();
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Raise a ticket"
      subtitle="We send it to the right team. You can follow it in My tickets."
      dirty={form.dirty}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'raise'}
            disabled={!form.ready}
            onClick={() =>
              void run('raise', async () => {
                await onRaise(form.input());
                form.clear();
              })
            }
          >
            Raise ticket
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The ticket was not raised">{error}</InlineAlert>}
        {form.fields}
      </div>
    </Drawer>
  );
}

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
}

/** The in-app Help drawer (US-B-100), open from every page: known issues, raise a ticket, my open tickets. */
export function HelpDrawer(props: HelpDrawerProps) {
  const form = useRaiseForm(props.desks, { onSuggest: props.onSuggest, hrefOf: props.articleHref });
  const [raised, setRaised] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const open = props.tickets.filter((t) => !['solved', 'closed'].includes(t.systemState));
  return (
    <Drawer
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Help"
      subtitle="Ask a team for help without leaving this page."
      dirty={form.dirty}
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>Close</Button>
          <Button
            variant="primary"
            loading={busy === 'raise'}
            disabled={!form.ready}
            onClick={() =>
              void run('raise', async () => {
                const r = await props.onRaise(form.input());
                setRaised(r.number);
                form.clear();
              })
            }
          >
            Raise ticket
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        <BannerList banners={props.banners} onMeToo={props.onMeToo} />
        {raised && (
          <InlineAlert tone="success" title="Ticket raised">
            Your ticket number is {raised}. The team will reply in the Help centre.
          </InlineAlert>
        )}
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
    </Drawer>
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
  onRate?: (score: number, comment?: string) => Promise<unknown>;
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
                  <FormField label="Your reply" hideLabel>
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
                      disabled={!text.trim()}
                      loading={busy === 'reply'}
                      onClick={() =>
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
            {props.onRate && (t.canRate || t.rating) && <RateTicketCard rating={t.rating ?? null} onRate={props.onRate} />}
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
                  <FormField label="Colleague's work email">
                    <TextField value={watcher} onChange={setWatcher} type="email" />
                  </FormField>
                  {added && <p className="yx-ops-muted">If {added} works here, they will get updates.</p>}
                  <div className="yx-ops-row">
                    <Button
                      disabled={!watcher.includes('@')}
                      loading={busy === 'watch'}
                      onClick={() =>
                        void run('watch', async () => {
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
