// HLP-01 Help centre, live (round 1 of the Helpdesk design wiring): the designed screen in helpdesk.tsx renders this
// when the page passes `live`. Same layout as the design (Find an answer, the resolved-ticket card, My tickets, the
// assistant rail, the raise drawer or the phone's bottom sheet) with the real records: the company's help articles,
// the person's own tickets with their resolution promise, known issues with "Me too", reading aids, "My data", the
// chat offer and WhatsApp / SMS help. Every call is checked again on the server (own records only).
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Lock, Plus, Search } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton, Link } from '../../components/button';
import { Badge, Tag } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { FileUpload, type UploadItem } from '../../components/upload';
import { Card, PageHeader } from '../../components/shell';
import { BottomSheet } from '../../components/overlay';
import { useNarrow } from '../../components/stepper';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { BannerList } from '../desk/help';
import { ArticleDrawer, useSuggestions, type KbArticleView, type KbHome, type KbSuggestion } from '../desk/help-kb';
import { ReadingAidsCard, ReadingAidsFrame, useReadingAids } from '../desk/reading-aids';
import { PrivacyRequestCard, type PortalScreenProps } from '../desk/portal';
import { ChatPromptBanner } from '../desk/chat';
import { MyChannelsCard, type MyChannelsCardProps } from '../desk/esm3';
import { StatusBadge } from '../desk/desk-kit';
import type { LoadState, MyTicketRow, PublicBanner, RaiseDesk, RaiseInput } from '../desk/types';
import { Actions, OpsDesk, SlaBadge, Workspace, useSay } from './ops-kit';

export interface LiveHelp {
  state: LoadState;
  onRetry: () => void;
  desks: RaiseDesk[];
  tickets: MyTicketRow[];
  onRaise: (input: RaiseInput) => Promise<{ id: string; number: string }>;
  /** Files chosen in the raise form go to the new ticket once it is made (they are virus-checked there). */
  onUpload: (ticketId: string, file: File) => Promise<unknown>;
  onOpen: (ticketId: string) => void;
  onRate: (ticketId: string, score: number) => Promise<unknown>;
  /** The company's help articles (null while loading or when there is no knowledge base). */
  kb: {
    home: KbHome | null;
    onSearch: (q: string) => Promise<KbSuggestion[]>;
    onArticle: (number: number, language?: string) => Promise<KbArticleView>;
    onFeedback: (articleId: string, helpful: boolean) => Promise<unknown>;
    onSolved: (articleId: string) => Promise<unknown>;
    /** Opened from a link (?article=12). */
    openNumber?: number | null;
  };
  articleHref: (number: number) => string;
  banners: PublicBanner[];
  onMeToo: (id: string) => Promise<unknown>;
  privacy?: PortalScreenProps['privacy'];
  chatPrompt?: { prompt: { text: string; desk: string; afterSeconds: number } | null; onChat: () => void; onDismiss: () => void } | null;
  channels?: MyChannelsCardProps | null;
  /** ?new=1 opens the raise form. */
  startRaise?: boolean;
  /** Phone: the back arrow goes to Me. */
  onBack?: () => void;
}

const DONE = ['solved', 'closed'];
const day = (iso: string | null | undefined) => (iso ? formatDate(new Date(iso)) : '');

/** The topic list of the design: every desk's categories, each saying which team gets it (and when it is private). */
export function topicOptions(desks: RaiseDesk[]) {
  return desks.flatMap((d) => {
    const own = d.categories.map((c) => ({ value: `${d.id}|${c.id}`, label: c.name, description: `${d.name}${c.sensitive ? ' · private to this team’s agents' : ''}` }));
    return own.length ? [...own, { value: `${d.id}|`, label: `Something else for ${d.name}`, description: d.name }] : [{ value: `${d.id}|`, label: d.name, description: 'Anything for this team' }];
  });
}

/** The ticket whose "resolved" card shows: the newest solved or closed one that can still be rated or reopened. */
export function rateCandidate(tickets: MyTicketRow[], now = new Date()): MyTicketRow | null {
  return [...tickets]
    .filter((t) => DONE.includes(t.systemState) && (t.canRate || (t.reopenUntil && new Date(t.reopenUntil) >= now)))
    .sort((a, b) => (b.resolvedAt ?? b.updatedAt).localeCompare(a.resolvedAt ?? a.updatedAt))[0] ?? null;
}

export function LiveHelpCentre({ live }: { live: LiveHelp }) {
  const phone = useNarrow();
  const [aids, setAids] = useReadingAids();
  const [raising, setRaising] = useState(Boolean(live.startRaise));
  const [query, setQuery] = useState('');
  const [article, setArticle] = useState<KbArticleView | null>(null);
  const { toast } = useSay();
  const kb = live.kb;
  const openArticle = (n: number, lang?: string) => void kb.onArticle(n, lang).then(setArticle, () => toast({ title: 'That article is not available. It may have been taken down.' }));
  useEffect(() => {
    if (kb.openNumber) openArticle(kb.openNumber);
    // Only when the link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kb.openNumber]);
  useEffect(() => {
    if (live.startRaise) setRaising(true);
  }, [live.startRaise]);
  const raise = () => (live.desks.length ? setRaising(true) : toast({ title: 'No team takes tickets here yet. Ask your HR or IT admin.' }));

  if (live.state === 'no-access')
    return (
      <OpsDesk area="helpdesk" active="Help centre" member={false}>
        <PageHeader title="Help centre" />
        <NoAccessState what="the Help centre" grantedBy="the person you act for to sign in themselves" note="It shows only your own tickets, so it is closed while you act for someone else." />
      </OpsDesk>
    );

  const search = <ArticleSearch home={kb.home} query={query} onQuery={setQuery} onSearch={kb.onSearch} onOpen={openArticle} hrefOf={live.articleHref} />;
  const candidate = live.state === 'ready' ? rateCandidate(live.tickets) : null;
  const rating = candidate && <ResolvedCard key={candidate.id} ticket={candidate} onRate={(s) => live.onRate(candidate.id, s)} onReopen={() => live.onOpen(candidate.id)} />;
  const tickets = <MyTickets live={live} />;
  const form = (
    <RaiseForm
      desks={live.desks}
      onSuggest={kb.onSearch}
      onOpenArticle={(a) => openArticle(a.number)}
      onDeflected={(a) => {
        void kb.onSolved(a.id).catch(() => undefined);
        toast({ tone: 'success', title: 'Glad that helped', description: `We didn't raise a ticket. Find “${a.title}” again in Find an answer.` });
        setRaising(false);
      }}
      onRaise={async (input, files) => {
        const r = await live.onRaise(input);
        const failed: string[] = [];
        for (const f of files) await live.onUpload(r.id, f).catch(() => failed.push(f.name));
        toast({ tone: 'success', title: 'Ticket raised', description: `Your ticket number is ${r.number}. The team will reply in My tickets.${failed.length ? ` ${failed.join(', ')} could not be added: open the ticket and add ${failed.length === 1 ? 'it' : 'them'} there.` : ''}` });
        setRaising(false);
      }}
      onCancel={() => setRaising(false)}
      sheet={phone}
      open={raising}
      onOpenChange={setRaising}
    />
  );
  const reader = article && (
    <ArticleDrawer
      open
      onOpenChange={(o) => !o && setArticle(null)}
      article={article}
      onLanguage={(l) => openArticle(article.number, l)}
      onFeedback={(h) => kb.onFeedback(article.id, h)}
      onSolved={() => kb.onSolved(article.id)}
      onStillNeedHelp={() => {
        setArticle(null);
        raise();
      }}
    />
  );
  const offer = live.chatPrompt ? <ChatPromptBanner {...live.chatPrompt} /> : null;
  const issues = live.banners.length ? <BannerList banners={live.banners} onMeToo={live.onMeToo} /> : null;

  if (phone)
    return (
      <ReadingAidsFrame value={aids}>
        <PhoneFrame tab="me" title="Help" back={<IconButton icon={ArrowLeft} label="Back to Me" onClick={live.onBack} />}>
          {offer}
          {issues}
          {search}
          <Button variant="primary" icon={Plus} fullWidth onClick={raise}>
            Raise a ticket
          </Button>
          {rating}
          <h2 className="yx-ops-card__title">My tickets</h2>
          {tickets}
          {form}
          {reader}
        </PhoneFrame>
      </ReadingAidsFrame>
    );

  return (
    <ReadingAidsFrame value={aids}>
      <OpsDesk area="helpdesk" active="Help centre" member={false}>
        <PageHeader
          title="Help centre"
          description="Search answers, ask the assistant, or raise a ticket with the right team."
          actions={
            <Button variant="primary" icon={Plus} onClick={raise}>
              Raise a ticket
            </Button>
          }
        />
        <Workspace
          main={
            <>
              {offer}
              {issues}
              <Card title="Find an answer">{search}</Card>
              {rating}
              <Card title="My tickets">{tickets}</Card>
            </>
          }
          rail={
            <>
              <Card title="Ask the assistant">
                <EmptyState compact title="The assistant is not switched on yet." description="Until then, search the articles or raise a ticket." />
              </Card>
              {live.channels && <MyChannelsCard {...live.channels} />}
              <ReadingAidsCard value={aids} onChange={setAids} />
              {live.privacy && <PrivacyRequestCard {...live.privacy} />}
            </>
          }
        />
        {form}
        {reader}
      </OpsDesk>
    </ReadingAidsFrame>
  );
}

function ArticleSearch({ home, query, onQuery, onSearch, onOpen, hrefOf }: { home: KbHome | null; query: string; onQuery: (q: string) => void; onSearch: (q: string) => Promise<KbSuggestion[]>; onOpen: (n: number) => void; hrefOf: (n: number) => string }) {
  const found = useSuggestions(query, onSearch);
  const searching = query.trim().length >= 3;
  const category = useMemo(() => {
    const names = new Map((home?.spaces ?? []).flatMap((s) => s.categories.map((c) => [c.id, c.name] as const)));
    return new Map((home?.articles ?? []).map((a) => [a.id, a.categoryId ? names.get(a.categoryId) : undefined]));
  }, [home]);
  const popular = home ? (home.featured.length ? home.featured : home.articles).slice(0, 4) : [];
  const results = searching ? found : popular;
  return (
    <div className="yx-ops-stack" data-gap="sm">
      <TextField value={query} onChange={onQuery} placeholder="Search help articles, e.g. payslip LOP" aria-label="Search help articles" prefix={<Search aria-hidden size={16} />} maxLength={100} />
      <section aria-label={searching ? 'Search results' : 'Popular articles'} className="yx-ops-stack" data-gap="sm">
        {searching ? (
          <p className="yx-ops-muted">{`${results.length} ${results.length === 1 ? 'article' : 'articles'} for “${query.trim()}”`}</p>
        ) : popular.length ? (
          <p className="yx-ops-muted">Popular articles</p>
        ) : null}
        {results.length === 0 ? (
          searching ? (
            <EmptyState compact title="No articles match these words." description="Try other words, or raise a ticket." />
          ) : (
            <EmptyState compact title="No help articles yet." description="Raise a ticket and the team will help." />
          )
        ) : (
          <ul className="yx-ops-list">
            {results.map((a) => (
              <li key={a.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <Link className="yx-ops-list__title" href={hrefOf(a.number)} onClick={(e) => (e.preventDefault(), onOpen(a.number))}>
                    {a.title}
                  </Link>
                  {a.summary && <span className="yx-ops-list__sub">{a.summary}</span>}
                </span>
                {category.get(a.id) && <Tag>{category.get(a.id)}</Tag>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MyTickets({ live }: { live: LiveHelp }) {
  if (live.state === 'loading')
    return (
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading your tickets">
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  if (live.state === 'error') return <ErrorState title="We couldn't load your tickets." description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />;
  if (!live.tickets.length) return <EmptyState compact title="You have no tickets." description="When you raise a ticket, you can follow it and its response time here." />;
  return (
    <ul className="yx-ops-stack yx-ops-plain" data-gap="sm" aria-label="My tickets">
      {live.tickets.map((t) => (
        <li key={t.id} className="yx-ops-tile">
          <div className="yx-ops-tile__row">
            <Link className="yx-ops-tile__title" href={`/yx/desk/help/${encodeURIComponent(t.id)}`} onClick={(e) => (e.preventDefault(), live.onOpen(t.id))}>
              {t.subject}
            </Link>
            <StatusBadge label={t.status} state={t.systemState} />
          </div>
          <div className="yx-ops-tile__row">
            <span className="yx-ops-muted">
              <span className="yx-ops-mono">{t.number}</span> · {t.desk} · raised {day(t.createdAt)}
              {t.role === 'requested_for' ? ' · raised for you' : t.role === 'watcher' ? ' · you follow it' : ''}
            </span>
            {!DONE.includes(t.systemState) && t.clock && <SlaBadge label="Resolve" elapsedMin={t.clock.usedMinutes} targetMin={t.clock.targetMinutes} paused={t.clock.paused} atRiskPercent={t.clock.atRiskPercent} />}
            {t.private ? (
              <Badge tone="neutral">
                <Lock aria-hidden size={12} /> Private
              </Badge>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The design's resolved-ticket card: when it closes, until when a reply reopens it, and the 1–5 rating. */
function ResolvedCard({ ticket: t, onRate, onReopen }: { ticket: MyTicketRow; onRate: (score: number) => Promise<unknown>; onReopen: () => void }) {
  const [score, setScore] = useState('');
  const [sent, setSent] = useState<number | null>(t.rating ?? null);
  const { busy, error, run } = useRun();
  const { toast } = useSay();
  const id = useId();
  const early = useTooEarly(score ? [] : [{ fieldId: id, message: 'Choose a rating from 1 to 5.' }]);
  const canReopen = Boolean(t.reopenUntil && new Date(t.reopenUntil) >= new Date());
  const closing = t.systemState === 'closed' ? `Closed on ${day(t.closedAt ?? t.updatedAt)}.` : t.closesOn ? `Closes on ${day(t.closesOn)} if you don't reply.` : '';
  return (
    <Card title={`Resolved: ${t.subject}`}>
      <div className="yx-ops-stack">
        <p className="yx-ops-muted">
          {closing} {canReopen ? `You can reopen it until ${day(t.reopenUntil)}: open it and reply to say what is still wrong.` : 'It can no longer be reopened. A reply starts a new ticket.'}
        </p>
        {error && <InlineAlert tone="danger" title="The rating was not saved">{error}</InlineAlert>}
        {sent ? (
          <p>You rated the help {sent} of 5. Thank you.</p>
        ) : t.canRate ? (
          <FormField id={id} label="How was the help you got?" error={early.errorOf(id)}>
            <RadioGroup
              orientation="horizontal"
              value={score}
              onChange={setScore}
              options={[
                { value: '1', label: '1 Poor' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
                { value: '5', label: '5 Very good' },
              ]}
            />
          </FormField>
        ) : null}
        <Actions>
          {!sent && t.canRate && (
            <Button
              loading={busy === 'rate'}
              onClick={() =>
                !early.stop() &&
                void run('rate', async () => {
                  await onRate(Number(score));
                  setSent(Number(score));
                  toast({ tone: 'success', title: 'Thanks. Your rating is saved.' });
                })
              }
            >
              Send rating
            </Button>
          )}
          {canReopen && <Button onClick={onReopen}>Reopen ticket</Button>}
        </Actions>
      </div>
    </Card>
  );
}

interface RaiseFormProps {
  desks: RaiseDesk[];
  onSuggest: (q: string) => Promise<KbSuggestion[]>;
  onOpenArticle: (a: KbSuggestion) => void;
  onDeflected: (a: KbSuggestion) => void;
  onRaise: (input: RaiseInput, files: File[]) => Promise<void>;
  onCancel: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Phone: a bottom sheet instead of the drawer. */
  sheet: boolean;
}

/** The design's raise form: topic (which says the team), subject, articles that may answer it, details, files, private. */
function RaiseForm(p: RaiseFormProps) {
  const options = topicOptions(p.desks);
  const [topic, setTopic] = useState<string | null>(options.length === 1 ? options[0].value : null);
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [formKey, setFormKey] = useState(0);
  const { busy, error, run } = useRun();
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const [deskId, categoryId] = (topic ?? '|').split('|');
  const desk = p.desks.find((d) => d.id === deskId);
  const category = desk?.categories.find((c) => c.id === categoryId);
  const suggestions = useSuggestions(`${subject} ${details.slice(0, 200)}`, p.onSuggest);
  const early = useTooEarly([
    ...(topic ? [] : [{ fieldId: fid('topic'), message: 'Choose what it is about.' }]),
    ...(subject.trim() ? [] : [{ fieldId: fid('subject'), message: 'Write a subject.' }]),
    ...(details.trim() ? [] : [{ fieldId: fid('details'), message: 'Add the details.' }]),
  ]);
  const clear = () => {
    setSubject('');
    setDetails('');
    setPrivate(false);
    setFiles([]);
    setFormKey((k) => k + 1);
  };
  const submit = () =>
    !early.stop() &&
    void run('raise', async () => {
      await p.onRaise({ deskId, categoryId: categoryId || undefined, subject: subject.trim(), description: details.trim(), impact: 3, urgency: 3, private: (isPrivate && !category?.sensitive) || undefined }, files.map((f) => f.file));
      clear();
    });
  const accept = desk?.attachmentTypes.length ? desk.attachmentTypes.map((x) => (x.startsWith('.') ? x : `.${x}`)) : ['.pdf', '.jpg', '.png'];
  const body: ReactNode = (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="The ticket was not raised">{error}</InlineAlert>}
      <FormField id={fid('topic')} label="What is it about?" required error={early.errorOf(fid('topic'))}>
        <Select value={topic} onChange={setTopic} options={options} placeholder="Choose a topic" />
      </FormField>
      <FormField id={fid('subject')} label="Subject" required helper="One line, e.g. “LOP on my September payslip”" error={early.errorOf(fid('subject'))}>
        <TextField value={subject} onChange={setSubject} maxLength={200} />
      </FormField>
      {suggestions.length > 0 && (
        <section className="yx-ops-stack" data-gap="sm" aria-live="polite" aria-label="Articles that may answer this">
          <p className="yx-ops-muted">These articles may answer your question</p>
          <ul className="yx-ops-list">
            {suggestions.slice(0, 3).map((a) => (
              <li key={a.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <Link className="yx-ops-list__title" href={`#article-${a.number}`} onClick={(e) => (e.preventDefault(), p.onOpenArticle(a))}>
                    {a.title}
                  </Link>
                  {a.summary && <span className="yx-ops-list__sub">{a.summary}</span>}
                </span>
                <Button size="sm" onClick={() => p.onDeflected(a)}>
                  This answers it
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <FormField id={fid('details')} label="Details" required helper="Add dates, amounts or screenshots so the team can help faster" error={early.errorOf(fid('details'))}>
        <TextArea value={details} onChange={setDetails} rows={4} maxLength={20000} />
      </FormField>
      <FormField label="Attachments" optional helper="Sent with the ticket and checked for viruses before the team opens them.">
        <FileUpload key={formKey} accept={accept} maxSize={(desk?.attachmentMaxMb ?? 10) * 1024 * 1024} multiple upload={async () => undefined} onItemsChange={(items) => setFiles(items.filter((i) => i.status === 'done'))} />
      </FormField>
      {category?.sensitive ? (
        <InlineAlert tone="info" title="Private by default">
          Only the {desk?.name} agents can see tickets about {category.name.toLowerCase()}.
        </InlineAlert>
      ) : (
        <Checkbox checked={isPrivate} onChange={setPrivate} label="Keep this private" description="Only the team's agents can see it, not their admins." />
      )}
    </div>
  );
  const footer = (
    <>
      <Button onClick={p.onCancel}>Cancel</Button>
      <Button variant="primary" loading={busy === 'raise'} onClick={submit}>
        Raise ticket
      </Button>
    </>
  );
  return p.sheet ? (
    <BottomSheet open={p.open} onOpenChange={p.onOpenChange} title="Raise a ticket" footer={footer}>
      {body}
    </BottomSheet>
  ) : (
    <Drawer open={p.open} onOpenChange={p.onOpenChange} title="Raise a ticket" subtitle="We route it to the right team. You can follow it in My tickets." dirty={Boolean(subject || details)} footer={footer}>
      {body}
    </Drawer>
  );
}
