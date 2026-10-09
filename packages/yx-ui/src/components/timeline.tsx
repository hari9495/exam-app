import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, Circle, CircleDot, FileText, Lock, MinusCircle, Paperclip, Pencil, Settings, X, XCircle } from 'lucide-react';
import { formatBytes } from '../lib/format';
import { formatDuration, groupByDay, relativeDayLabel, timeOf } from '../lib/dates';
import { Button, ButtonGroup, IconButton } from './button';
import { Avatar } from './display';
import { Badge } from './display';
import { EmptyState } from './feedback';
import { Icon, VisuallyHidden } from './foundations';
import { Switch } from './choice';
import { TextArea } from './inputs';

export interface Actor {
  name: string;
  src?: string | null;
}

function Time({ at }: { at: Date }) {
  // A date with no time part (exactly midnight) is a dated event: no made-up "12:00 am".
  if (at.getHours() === 0 && at.getMinutes() === 0 && at.getSeconds() === 0) return null;
  return (
    <time className="yx-tl__time" dateTime={at.toISOString()}>
      {timeOf(at)}
    </time>
  );
}

/* ---------------- Timeline (§29) ---------------- */

export interface TimelineItem {
  id: string;
  actor: Actor;
  /** "approved the leave request", "changed the shift to Night". */
  action: ReactNode;
  at: Date;
}

/** Actor name for steps done by the system (rules, schedules): shown with a gear, not initials. */
export const SYSTEM_ACTOR = 'Automatic';

/** Vertical activity timeline: newest first, grouped by day, actor + action + time (§29). */
export function Timeline({ items, today, 'aria-label': ariaLabel = 'Activity' }: { items: TimelineItem[]; today?: Date; 'aria-label'?: string }) {
  const now = today ?? new Date();
  return (
    <section className="yx-tl" aria-label={ariaLabel}>
      {groupByDay(items, (i) => i.at).map((g) => (
        <div key={g.day.toISOString()} className="yx-tl__group">
          <h3 className="yx-tl__day">{relativeDayLabel(g.day, now)}</h3>
          <ol className="yx-tl__list">
            {g.items.map((i) => (
              <li key={i.id} className="yx-tl__item" data-system={i.actor.name === SYSTEM_ACTOR || undefined}>
                {i.actor.name === SYSTEM_ACTOR ? (
                  <span className="yx-tl__system" aria-hidden="true">
                    <Icon icon={Settings} />
                  </span>
                ) : (
                  <Avatar name={i.actor.name} src={i.actor.src} size={24} />
                )}
                <p className="yx-tl__text">
                  <span className="yx-tl__actor">{i.actor.name}</span> {i.action}
                </p>
                <Time at={i.at} />
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

/* ---------------- Approval timeline ---------------- */

export type ApprovalStepStatus = 'done' | 'current' | 'pending' | 'rejected' | 'skipped';
const STEP: Record<ApprovalStepStatus, { icon: typeof Circle; text: string }> = {
  done: { icon: CheckCircle2, text: 'Done' },
  current: { icon: CircleDot, text: 'Waiting' },
  pending: { icon: Circle, text: 'Not started' },
  rejected: { icon: XCircle, text: 'Rejected' },
  skipped: { icon: MinusCircle, text: 'Skipped' },
};

export interface ApprovalStep {
  id: string;
  /** "Submitted", "Manager approval", "HR review", "Payroll". */
  label: string;
  status: ApprovalStepStatus;
  approver?: string;
  /** When the step finished (done, rejected, skipped). */
  at?: Date;
  comment?: string;
}

/** Steps of an approval (P03) with status icon + text, approver, time taken and comments. */
export function ApprovalTimeline({ steps, now: nowProp, 'aria-label': ariaLabel = 'Approval steps' }: { steps: ApprovalStep[]; now?: Date; 'aria-label'?: string }) {
  const now = nowProp ?? new Date();
  let prev: Date | undefined;
  return (
    <ol className="yx-approval" aria-label={ariaLabel}>
      {steps.map((s) => {
        const since = prev;
        if (s.at) prev = s.at;
        const took = s.at && since && s.status !== 'skipped' ? `Took ${formatDuration(s.at.getTime() - since.getTime())}` : null;
        const waiting = s.status === 'current' && since ? `Waiting ${formatDuration(now.getTime() - since.getTime())}` : null;
        return (
          <li key={s.id} className="yx-approval__step" data-status={s.status} aria-current={s.status === 'current' ? 'step' : undefined}>
            <span className="yx-approval__icon">
              <Icon icon={STEP[s.status].icon} />
            </span>
            <div className="yx-approval__body">
              <p className="yx-approval__head">
                <span className="yx-approval__label">{s.label}</span>
                <span className="yx-approval__status">{STEP[s.status].text}</span>
              </p>
              {/* The date-time and the duration each break as a unit ("10:42 am", "Took 1 day 1 h"); no year when it is this year. */}
              <p className="yx-approval__meta">
                {[
                  s.approver,
                  s.at && `${s.at.getFullYear() === now.getFullYear() ? relativeDayLabel(s.at, now).replace(/ \d{4}$/, '') : relativeDayLabel(s.at, now)}, ${timeOf(s.at)}`,
                  took ?? waiting,
                ]
                  .filter(Boolean)
                  .map((part, k) => (
                    <span key={k}>
                      {k > 0 && ' · '}
                      <span className={k > 0 ? 'yx-approval__unit' : undefined}>{part}</span>
                    </span>
                  ))}
              </p>
              {s.comment && <blockquote className="yx-approval__comment">{s.comment}</blockquote>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- Activity feed (object page right panel, §10) ---------------- */

export type ActivityKind = 'change' | 'comment' | 'approval';
export type ActivityFilter = 'all' | ActivityKind;
const FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'change', label: 'Changes' },
  { value: 'comment', label: 'Comments' },
  { value: 'approval', label: 'Approvals' },
];

export interface FieldChange {
  field: string;
  from?: ReactNode;
  to?: ReactNode;
}

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** null = done by the system (a rule, a sync, a scheduled job). */
  actor: Actor | null;
  at: Date;
  text: ReactNode;
  changes?: FieldChange[];
}

export interface ActivityFeedProps {
  entries: ActivityEntry[];
  filter?: ActivityFilter;
  defaultFilter?: ActivityFilter;
  onFilterChange?: (f: ActivityFilter) => void;
  /** Shows "Load older" when set and hasMore is true. */
  onLoadOlder?: () => void;
  hasMore?: boolean;
  loadingOlder?: boolean;
  today?: Date;
}

export function ActivityFeed({ entries, filter: filterProp, defaultFilter = 'all', onFilterChange, onLoadOlder, hasMore, loadingOlder, today }: ActivityFeedProps) {
  const [filterState, setFilterState] = useState(defaultFilter);
  const filter = filterProp ?? filterState;
  const setFilter = (f: ActivityFilter) => {
    setFilterState(f);
    onFilterChange?.(f);
  };
  const now = today ?? new Date();
  const shown = entries.filter((e) => filter === 'all' || e.kind === filter);
  return (
    <section className="yx-feed" aria-label="Activity">
      <ButtonGroup aria-label="Show">
        {FILTERS.map((f) => (
          <Button key={f.value} size="sm" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Button>
        ))}
      </ButtonGroup>
      {shown.length === 0 ? (
        <EmptyState compact title={`No ${FILTERS.find((f) => f.value === filter)!.label.toLowerCase()} yet.`} action={filter !== 'all' && <Button onClick={() => setFilter('all')}>Show all activity</Button>} />
      ) : (
        groupByDay(shown, (e) => e.at).map((g) => (
          <div key={g.day.toISOString()} className="yx-tl__group">
            <h3 className="yx-tl__day">{relativeDayLabel(g.day, now)}</h3>
            <ol className="yx-tl__list">
              {g.items.map((e) => (
                <li key={e.id} className="yx-tl__item" data-system={!e.actor || undefined}>
                  {e.actor ? (
                    <Avatar name={e.actor.name} src={e.actor.src} size={24} />
                  ) : (
                    <span className="yx-tl__system" aria-hidden="true">
                      <Icon icon={Settings} />
                    </span>
                  )}
                  <div className="yx-tl__text">
                    <p className="yx-tl__line">
                      <span className="yx-tl__actor">{e.actor ? e.actor.name : 'System'}</span> {e.text}
                    </p>
                    {e.changes && (
                      <ul className="yx-feed__changes">
                        {e.changes.map((c) => (
                          <li key={c.field} className="yx-feed__change">
                            <span className="yx-feed__field">{c.field}</span>
                            <VisuallyHidden> changed from </VisuallyHidden>
                            <span className="yx-feed__old">{c.from ?? 'Empty'}</span>
                            <Icon icon={ArrowRight} />
                            <VisuallyHidden> to </VisuallyHidden>
                            <span className="yx-feed__new">{c.to ?? 'Empty'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Time at={e.at} />
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
      {onLoadOlder && hasMore && (
        <Button className="yx-feed__older" onClick={onLoadOlder} loading={loadingOlder}>
          Load older
        </Button>
      )}
    </section>
  );
}

/* ---------------- Comment thread (§47) ---------------- */

export interface MentionPerson {
  id: string;
  name: string;
  role?: string;
}

/** Stored mention markup: "@[Sana Nizami](e3)". */
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
export type CommentSegment = { text: string } | { mention: { id: string; name: string } };

/** Splits a stored comment body into text and mentions, and lists the mentioned ids (unique). */
export function parseMentions(body: string): { segments: CommentSegment[]; ids: string[] } {
  const segments: CommentSegment[] = [];
  const ids: string[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index! > last) segments.push({ text: body.slice(last, m.index) });
    segments.push({ mention: { name: m[1], id: m[2] } });
    if (!ids.includes(m[2])) ids.push(m[2]);
    last = m.index! + m[0].length;
  }
  if (last < body.length) segments.push({ text: body.slice(last) });
  return { segments, ids };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Turns "@Sana Nizami" typed in the composer into stored markup for known people (longest names first). */
export function toMentionMarkup(text: string, people: MentionPerson[]): string {
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  if (!sorted.length) return text;
  const re = new RegExp(`@(${sorted.map((p) => escapeRe(p.name)).join('|')})(?![\\w])`, 'g');
  return text.replace(re, (_, name: string) => `@[${name}](${sorted.find((p) => p.name === name)!.id})`);
}
/** Stored markup back to plain "@Name" text, for editing. */
export const fromMentionMarkup = (body: string) => body.replace(MENTION_RE, '@$1');

/** §47: authors can edit a comment for 15 minutes. */
export const EDIT_WINDOW_MS = 15 * 60_000;
export const canEditComment = (c: { author: { id: string }; at: Date }, userId: string, now: Date) =>
  c.author.id === userId && now.getTime() - c.at.getTime() <= EDIT_WINDOW_MS;

/** The "@query" being typed just before the caret, or null. */
export function mentionQuery(textBeforeCaret: string): string | null {
  const m = /(?:^|\s)@([^\s@[]{0,30})$/.exec(textBeforeCaret);
  return m ? m[1] : null;
}

export interface CommentAuthor {
  id: string;
  name: string;
  src?: string | null;
}

export interface Comment {
  id: string;
  author: CommentAuthor;
  /** Text with mention markup "@[Name](id)". */
  body: string;
  at: Date;
  editedAt?: Date;
  /** Private HR note: never shown to the employee (§47). */
  private?: boolean;
  attachments?: { name: string; size: number }[];
}

export interface NewComment {
  body: string;
  mentions: string[];
  private: boolean;
  files: File[];
}

export interface CommentThreadProps {
  defaultComments?: Comment[];
  currentUser: CommentAuthor;
  /** People who can be @mentioned. */
  people: MentionPerson[];
  /** HR roles only: shows the private-note switch. */
  canWritePrivate?: boolean;
  resolved?: boolean;
  defaultResolved?: boolean;
  onResolvedChange?: (resolved: boolean) => void;
  /** Show the thread's own Resolve button (default true). Turn off where the page has its own resolve action. */
  resolvable?: boolean;
  onAdd?: (c: NewComment) => void;
  onEdit?: (id: string, body: string) => void;
  /** Clock for the edit window. Defaults to now. */
  now?: Date;
  /** Composer text on first render; ending in "@…" opens the mention list (docs and screenshot tests). */
  defaultDraft?: string;
  defaultPrivate?: boolean;
}

function Body({ body }: { body: string }) {
  return (
    <p className="yx-comment__body">
      {parseMentions(body).segments.map((s, i) =>
        'text' in s ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i} className="yx-comment__mention">
            @{s.mention.name}
          </span>
        ),
      )}
    </p>
  );
}

let seq = 0;

/** Comments with @mentions, attachments, a 15-minute edit window, resolve, and private HR notes (§47). */
export function CommentThread({
  defaultComments = [],
  currentUser,
  people,
  canWritePrivate,
  resolved: resolvedProp,
  defaultResolved = false,
  onResolvedChange,
  resolvable = true,
  onAdd,
  onEdit,
  now: nowProp,
  defaultDraft = '',
  defaultPrivate = false,
}: CommentThreadProps) {
  const now = nowProp ?? new Date();
  const [comments, setComments] = useState(defaultComments);
  const [resolvedState, setResolvedState] = useState(defaultResolved);
  const resolved = resolvedProp ?? resolvedState;
  const setResolved = (r: boolean) => {
    setResolvedState(r);
    onResolvedChange?.(r);
  };
  const [draft, setDraft] = useState(defaultDraft);
  const [query, setQuery] = useState<string | null>(() => mentionQuery(defaultDraft));
  const [active, setActive] = useState(0);
  const [isPrivate, setPrivate] = useState(defaultPrivate);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const matches = useMemo(
    () => (query === null ? [] : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)),
    [people, query],
  );
  const listOpen = query !== null && matches.length > 0;

  const onDraftChange = (v: string) => {
    setDraft(v);
    setError('');
    const caret = areaRef.current?.selectionStart ?? v.length;
    setQuery(mentionQuery(v.slice(0, caret)));
    setActive(0);
  };

  const pick = (p: MentionPerson) => {
    const el = areaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@([^\s@[]{0,30})$/, `@${p.name} `);
    const next = before + draft.slice(caret);
    setDraft(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const post = () => {
    if (!draft.trim()) {
      setError('Write a comment before you post it.');
      return;
    }
    const body = toMentionMarkup(draft.trim(), people);
    const c: Comment = {
      id: `new-${++seq}`,
      author: currentUser,
      body,
      at: now,
      private: isPrivate || undefined,
      attachments: files.length ? files.map((f) => ({ name: f.name, size: f.size })) : undefined,
    };
    setComments((cs) => [...cs, c]);
    onAdd?.({ body, mentions: parseMentions(body).ids, private: isPrivate, files });
    setDraft('');
    setFiles([]);
    setQuery(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (listOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      post();
    }
  };

  const saveEdit = () => {
    if (!editing || !editing.text.trim()) return;
    const body = toMentionMarkup(editing.text.trim(), people);
    setComments((cs) => cs.map((c) => (c.id === editing.id ? { ...c, body, editedAt: now } : c)));
    onEdit?.(editing.id, body);
    setEditing(null);
  };

  const listId = `${uid}-mentions`;

  return (
    <section className="yx-comments" aria-label="Comments" data-resolved={resolved || undefined}>
      <div className="yx-comments__bar">
        <h3 className="yx-comments__title">
          Comments <span className="yx-comments__count">{comments.length}</span>
        </h3>
        {resolved && <Badge tone="success">Resolved</Badge>}
        {resolvable && comments.length > 0 && (
          <Button size="sm" onClick={() => setResolved(!resolved)}>
            {resolved ? 'Reopen thread' : 'Resolve thread'}
          </Button>
        )}
      </div>

      {comments.length === 0 ? (
        <EmptyState compact title="No comments yet." description="Type @ to mention someone. They get a notification." />
      ) : (
        <ol className="yx-comments__list">
          {comments.map((c) => (
            <li key={c.id} className="yx-comment" data-private={c.private || undefined}>
              <Avatar name={c.author.name} src={c.author.src} size={32} />
              <div className="yx-comment__main">
                <p className="yx-comment__head">
                  <span className="yx-tl__actor">{c.author.name}</span>
                  <span className="yx-comment__when">
                    {relativeDayLabel(c.at, now)}, {timeOf(c.at)}
                  </span>
                  {c.editedAt && <span className="yx-comment__edited">Edited</span>}
                  {c.private && (
                    <span className="yx-comment__private">
                      <Icon icon={Lock} />
                      Private
                    </span>
                  )}
                  {!resolved && canEditComment(c, currentUser.id, now) && editing?.id !== c.id && (
                    <IconButton icon={Pencil} size="sm" label="Edit comment" onClick={() => setEditing({ id: c.id, text: fromMentionMarkup(c.body) })} />
                  )}
                </p>
                {editing?.id === c.id ? (
                  <div className="yx-comment__edit">
                    <TextArea aria-label="Edit comment" rows={3} value={editing.text} onChange={(t) => setEditing({ id: c.id, text: t })} />
                    <div className="yx-comments__actions">
                      <Button size="sm" onClick={saveEdit}>
                        Save changes
                      </Button>
                      <Button size="sm" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Body body={c.body} />
                )}
                {c.attachments && (
                  <ul className="yx-comment__files">
                    {c.attachments.map((f) => (
                      <li key={f.name}>
                        <Icon icon={FileText} />
                        <span>{f.name}</span>
                        <span className="yx-comment__size">{formatBytes(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {resolved ? (
        <p className="yx-comments__note">This thread is resolved. Reopen it to add a comment.</p>
      ) : (
        <div className="yx-comments__composer" data-private={isPrivate || undefined}>
          <div className="yx-comments__field">
            <TextArea
              ref={areaRef}
              rows={3}
              aria-label={isPrivate ? 'Private HR note' : 'Comment'}
              placeholder={isPrivate ? 'Write a private note for HR' : 'Write a comment. Type @ to mention someone.'}
              value={draft}
              onChange={onDraftChange}
              onKeyDown={onKeyDown}
              aria-autocomplete="list"
              aria-controls={listOpen ? listId : undefined}
              aria-activedescendant={listOpen ? `${listId}-${active}` : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-err` : undefined}
            />
            {listOpen && (
              <ul className="yx-mentions" id={listId} role="listbox" aria-label="People to mention">
                {matches.map((p, i) => (
                  <li
                    key={p.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="yx-mentions__item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(p);
                    }}
                  >
                    <Avatar name={p.name} size={24} />
                    <span className="yx-mentions__name">{p.name}</span>
                    {p.role && <span className="yx-mentions__role">{p.role}</span>}
                  </li>
                ))}
              </ul>
            )}
            <VisuallyHidden aria-live="polite">{listOpen ? `${matches.length} ${matches.length === 1 ? 'person' : 'people'} found. Use the arrow keys, then Enter.` : ''}</VisuallyHidden>
          </div>
          {error && (
            <p id={`${uid}-err`} className="yx-comments__error" role="alert">
              {error}
            </p>
          )}
          {files.length > 0 && (
            <ul className="yx-comment__files">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <Icon icon={FileText} />
                  <span>{f.name}</span>
                  <span className="yx-comment__size">{formatBytes(f.size)}</span>
                  <IconButton icon={X} size="sm" label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ul>
          )}
          {canWritePrivate && <Switch label="Private HR note — hidden from the employee" checked={isPrivate} onChange={setPrivate} />}
          <div className="yx-comments__actions">
            <IconButton icon={Paperclip} variant="secondary" label="Attach file" onClick={() => fileRef.current?.click()} />
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                setFiles([...files, ...Array.from(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
            <Button variant="primary" onClick={post}>
              {isPrivate ? 'Add private note' : 'Post comment'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
