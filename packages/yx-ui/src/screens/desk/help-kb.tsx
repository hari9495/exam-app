import { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, Search, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { useToast } from '../../components/notify';
import { TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { MessageBody, when } from './desk-kit';
import type { DeskClosed } from './types';

// The requester's side of the knowledge base (SD-1.24 / SD-1.25, US-B-105, YX-HD-04): articles suggested while they
// type, the help articles of their company, "Was this helpful?", "This solved it" (counted as self-service, no ticket
// is made), and rating a solved ticket (SD-1.26, US-B-108). Used by the Help centre, the Help drawer, the outside
// portal and the public help centre. Article text is server-cleaned HTML (sanitize-html allow-list).

export interface KbSuggestion {
  id: string;
  number: number;
  slug?: string;
  title: string;
  summary: string | null;
  /** YX-11 (C-8): an article YukthiX wrote for every company, read on the public help centre at this address. */
  source?: 'yukthix';
  href?: string;
}

export interface KbArticleView {
  id: string;
  number: number;
  slug?: string;
  title: string;
  summary: string | null;
  bodyHtml: string;
  language: string;
  languages: string[];
  /** The reader's language has no published translation: the English article is shown with a notice. */
  fallback: boolean;
  updatedAt: string;
}

export interface KbHome {
  spaces: { id: string; slug: string; name: string; categories: { id: string; parentId: string | null; name: string }[] }[];
  featured: KbSuggestion[];
  articles: (KbSuggestion & { categoryId: string | null; spaceId: string })[];
}

export const LANGUAGE_LABEL: Record<string, string> = { en: 'English', hi: 'हिन्दी', ta: 'தமிழ்', te: 'తెలుగు' };

/** Asks for suggestions 300 ms after the words stop changing (3 letters at least); keeps only the latest answer. */
export function useSuggestions(text: string, onSuggest?: (q: string) => Promise<KbSuggestion[]>) {
  const [items, setItems] = useState<KbSuggestion[]>([]);
  const latest = useRef(0);
  // Pages pass a new function on every render: keep the latest one without asking again for it.
  const ask = useRef(onSuggest);
  ask.current = onSuggest;
  const enabled = Boolean(onSuggest);
  useEffect(() => {
    const q = text.trim();
    const n = ++latest.current;
    if (!enabled || q.length < 3) {
      setItems((cur) => (cur.length ? [] : cur));
      return;
    }
    const h = setTimeout(() => {
      ask.current?.(q.slice(0, 100))
        .then((r) => n === latest.current && setItems(r))
        .catch(() => n === latest.current && setItems([]));
    }, 300);
    return () => clearTimeout(h);
  }, [text, enabled]);
  return items;
}

/** "These articles may help" under the raise form (US-B-105). */
export function SuggestList({ items, onOpen, hrefOf }: { items: KbSuggestion[]; onOpen?: (a: KbSuggestion) => void; hrefOf?: (a: KbSuggestion) => string }) {
  if (!items.length) return null;
  return (
    <section className="yx-desk-kb-suggest" aria-label="Articles that may help">
      <p className="yx-ops-muted">
        <BookOpen aria-hidden size={14} /> These articles may help:
      </p>
      <ul className="yx-ops-list">
        {items.map((a) => (
          <li key={a.id} className="yx-ops-list__item">
            <span className="yx-ops-list__main">
              {hrefOf ? (
                <a className="yx-desk-link" href={hrefOf(a)} target="_blank" rel="noopener noreferrer">
                  {a.title}
                </a>
              ) : (
                <button type="button" className="yx-desk-link" onClick={() => onOpen?.(a)}>
                  {a.title}
                </button>
              )}
              {a.summary && <span className="yx-ops-list__sub">{a.summary}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ArticleBodyProps {
  article: KbArticleView;
  onLanguage?: (lang: string) => void;
  onFeedback?: (helpful: boolean) => Promise<unknown>;
  /** "This solved it": no ticket needed. */
  onSolved?: () => Promise<unknown>;
  /** "I still need help": back to the raise form. */
  onStillNeedHelp?: () => void;
  timeZone?: string;
}

/** One article with its language choice, feedback and "This solved it". */
export function ArticleBody({ article, onLanguage, onFeedback, onSolved, onStillNeedHelp, timeZone }: ArticleBodyProps) {
  const { busy, error, run } = useRun();
  const [voted, setVoted] = useState<boolean | null>(null);
  const [solved, setSolved] = useState(false);
  const { toast } = useToast();
  /** One vote per article: a second press says so. */
  const vote = (yes: boolean) => (voted !== null ? toast({ title: 'You have already told us. Thank you.' }) : void run(yes ? 'yes' : 'no', async () => { await onFeedback!(yes); setVoted(yes); }));
  const langs = article.languages.length > 1 && article.languages.length <= 4 ? article.languages : null;
  return (
    // 1603 (founder, 12 Nov 2026): drawn in the HLP-04 article look: the number and date first (as the editor's header),
    // the answer in a card, then the feedback.
    <article className="yx-ops-stack yx-desk-kb-article" aria-label={article.title}>
      <p className="yx-ops-muted">
        <BookOpen size={14} aria-hidden="true" /> <span className="yx-ops-mono">KB-{article.number}</span> · updated {when(article.updatedAt, timeZone)}
      </p>
      {langs && onLanguage && <Segment label="Language" options={langs.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] ?? l }))} value={article.language} onChange={onLanguage} />}
      {article.fallback && <InlineAlert tone="info">This article is not in your language yet, so it is shown in English.</InlineAlert>}
      <Card>
        <div className="yx-ops-stack">
          {article.summary && <p className="yx-ops-muted">{article.summary}</p>}
          <MessageBody html={article.bodyHtml} />
        </div>
      </Card>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {onFeedback && (
        <div className="yx-ops-row" role="group" aria-label="Was this helpful?">
          <span>Was this helpful?</span>
          <Button size="sm" icon={ThumbsUp} loading={busy === 'yes'} onClick={() => vote(true)}>
            Yes
          </Button>
          <Button size="sm" icon={ThumbsDown} loading={busy === 'no'} onClick={() => vote(false)}>
            No
          </Button>
          {voted !== null && <span className="yx-ops-muted">Thank you for telling us.</span>}
        </div>
      )}
      {(onSolved || onStillNeedHelp) && (
        <div className="yx-ops-row">
          {onSolved &&
            (solved ? (
              <span className="yx-ops-muted">No ticket was needed.</span>
            ) : (
              <Button variant="primary" icon={CheckCircle2} loading={busy === 'solved'} onClick={() => void run('solved', async () => { await onSolved(); setSolved(true); toast({ tone: 'success', title: 'Glad it helped', description: 'No ticket was needed.' }); })}>

                This solved it
              </Button>
            ))}
          {onStillNeedHelp && !solved && <Button onClick={onStillNeedHelp}>I still need help</Button>}
        </div>
      )}
    </article>
  );
}

/** The article in a side panel (Help centre, portal). */
export function ArticleDrawer({ open, onOpenChange, article, ...rest }: ArticleBodyProps & { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={article.title} size="lg" footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}>
      <ArticleBody article={article} {...rest} />
    </Drawer>
  );
}

export interface KnowledgeCardProps {
  home: KbHome | null;
  onSearch: (q: string) => Promise<KbSuggestion[]>;
  onOpen: (a: KbSuggestion) => void;
  /** The search box text from the page (?q=…). */
  defaultQuery?: string;
}

/** Search the help articles, featured ones, and browse by category (US-B-105, US-G-217). */
export function KnowledgeCard({ home, onSearch, onOpen, defaultQuery = '' }: KnowledgeCardProps) {
  const [q, setQ] = useState(defaultQuery);
  const found = useSuggestions(q, onSearch);
  const [space, setSpace] = useState<string | null>(null);
  if (!home || !home.spaces.length) return null;
  const sp = home.spaces.find((s) => s.id === space) ?? home.spaces[0];
  const inCat = (id: string | null) => home.articles.filter((a) => a.spaceId === sp.id && a.categoryId === id);
  const tops = sp.categories.filter((c) => !c.parentId);
  return (
    <Card title="Find an answer">
      <div className="yx-ops-stack">
        <FormField label="Search help articles" hideLabel>
          <TextField value={q} onChange={setQ} placeholder="Search help articles, e.g. “Wi-Fi”" prefix={<Search aria-hidden size={14} />} maxLength={100} />
        </FormField>
        {q.trim().length >= 3 && !found.length && <p className="yx-ops-muted">No articles match yet. Raise a ticket and the team will help.</p>}
        <SuggestList items={found} onOpen={onOpen} />
        {!q.trim() && (
          <>
            {home.featured.length > 0 && (
              <section aria-label="Popular articles">
                <p className="yx-ops-muted">
                  <Star aria-hidden size={14} /> Popular
                </p>
                <SuggestList items={home.featured} onOpen={onOpen} />
              </section>
            )}
            {home.spaces.length > 1 && home.spaces.length <= 4 && <Segment label="Help topics" options={home.spaces.map((s) => ({ value: s.id, label: s.name }))} value={sp.id} onChange={setSpace} />}
            {tops.length === 0 && inCat(null).length === 0 ? (
              <EmptyState compact title="No articles here yet." />
            ) : (
              <div className="yx-desk-kb-tree">
                {tops.map((c) => {
                  const subs = sp.categories.filter((x) => x.parentId === c.id);
                  const list = [...inCat(c.id), ...subs.flatMap((s) => inCat(s.id))];
                  return list.length ? (
                    <div key={c.id}>
                      <h4 className="yx-ops-card__title">{c.name}</h4>
                      <SuggestList items={list} onOpen={onOpen} />
                    </div>
                  ) : null;
                })}
                <SuggestList items={inCat(null)} onOpen={onOpen} />
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/** Answer 1646: the desk is closed now; its own words, with {opens} as its next opening time. */
export function DeskClosedNotice({ closed }: { closed: DeskClosed }) {
  const opens = closed.opensAt ? when(closed.opensAt) : 'soon';
  return (
    <InlineAlert tone="info" title="Closed now">
      {closed.message.includes('{opens}') ? closed.message.split('{opens}').join(opens) : `${closed.message} We open again ${opens}.`}
    </InlineAlert>
  );
}

const STARS = [1, 2, 3, 4, 5] as const;
const STAR_WORDS = ['', 'Very poor', 'Poor', 'OK', 'Good', 'Very good'];

/** Rate a solved ticket (US-B-108). One answer per ticket. */
export function RateTicketCard({ rating, reasons = [], onRate }: { rating: number | null; reasons?: string[]; onRate: (score: number, comment?: string, reason?: string) => Promise<unknown> }) {
  const [score, setScore] = useState<number>(5);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState<number | null>(rating);
  const { busy, error, run } = useRun();
  return (
    <Card title="How did we do?">
      {done ? (
        <p>
          You rated this ticket {done} of 5 ({STAR_WORDS[done].toLowerCase()}). Thank you.
        </p>
      ) : (
        <div className="yx-ops-stack" data-gap="sm">
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Segment label="Your rating, 1 very poor to 5 very good" options={STARS.map((s) => ({ value: s, label: String(s) }))} value={score} onChange={setScore} />
          <p className="yx-ops-muted">
            {score} = {STAR_WORDS[score].toLowerCase()}
          </p>
          {reasons.length > 0 && (
            <FormField label="The main reason" optional>
              <Select value={reason} onChange={setReason} clearable placeholder="Choose a reason" options={reasons.map((r) => ({ value: r, label: r }))} />
            </FormField>
          )}
          <FormField label="Anything to add?" optional>
            <TextArea value={comment} onChange={setComment} rows={3} maxLength={1000} />
          </FormField>
          <div className="yx-ops-row">
            <Button variant="primary" loading={busy === 'rate'} onClick={() => void run('rate', async () => { await onRate(score, comment.trim() || undefined, reason ?? undefined); setDone(score); })}>
              Send rating
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
