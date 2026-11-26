// Batch G2 items 12 and 100 (M09 Q1-Q2; answer 2601): the ENG-01 feed and spaces, ENG-02 post composer and ENG-11
// moderation queue with real records, drawn in the designed layouts. FeedScreen, PostComposerScreen and ModerationScreen
// (engage-feed.tsx) render these when given `live`.
import { useState } from 'react';
import { Eye, EyeOff, Flag, Plus, RotateCcw, Send, Trash2, UserX } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Select } from '../../components/select';
import { MenuItem } from '../../components/menu';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { MessageBody } from '../desk/desk-kit';
import { CelebrationChoices, CelebrationStrip, CommentsDrawer, GrowthFrame, PostCard, type Celebration, type FeedComment, type FeedPost } from './growth-kit';
import { moderate } from './growth-logic';

/** An announcement for me (item 12). */
export interface LiveFeedPost {
  id: string;
  kind: 'announcement';
  title: string;
  /** Cleaned HTML (the server's allow-list). */
  body: string;
  author: string;
  authorLeft: boolean;
  at: string;
  pinned: boolean;
  ack: { due: string | null; done: boolean } | null;
}
/** An update in one of my spaces (item 100). */
export interface LiveUpdate {
  id: string;
  kind: 'update';
  spaceId: string | null;
  space: string;
  body: string;
  author: string;
  authorLeft: boolean;
  mine: boolean;
  at: string;
  state: 'published' | 'pending' | 'held';
  likes: number;
  liked: boolean;
  comments: number;
  /** Batch G2 item 73: a kudos names the people thanked, the value and the badge. */
  kudos?: { to: string[]; value: string; badge: string | null } | null;
  /** Batch G2 item 75: a poll; the counts come once I voted or after it closed. */
  poll?: { options: string[]; closesOn: string; closed: boolean; myVote: number | null; votes: number[] | null } | null;
}
export interface LiveSpace {
  id: string;
  name: string;
  kind: 'company' | 'location' | 'department';
  approval: boolean;
  members?: number;
  joined?: boolean;
}
export interface LiveFeed {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  now: Date;
  persona?: 'emp' | 'hr' | 'mgr';
  posts: LiveFeedPost[];
  onAck: (id: string) => Promise<unknown>;
  updates?: LiveUpdate[];
  /** The spaces I am in (the filter, My spaces). */
  spaces?: LiveSpace[];
  /** Every space, with members (the directory tab). */
  directory?: LiveSpace[] | null;
  space?: string | null;
  onSpace?: (id: string | null) => void;
  onWrite?: () => void;
  onLike?: (id: string) => Promise<unknown>;
  onReport?: (id: string) => Promise<unknown>;
  loadComments?: (id: string) => Promise<FeedComment[]>;
  onComment?: (id: string, text: string) => Promise<{ held: boolean }>;
  onReportComment?: (id: string) => Promise<unknown>;
  onVote?: (id: string, option: number) => Promise<unknown>;
  /** Batch G2 item 74: an open survey for me (the side card). */
  openSurvey?: { id: string; name: string; closesOn: string; questions: number; anonymous: boolean } | null;
  onTakeSurvey?: (id: string) => void;
  /** Batch G2 item 76: today's celebrations, and my own choices of which of mine show. */
  celebrations?: Celebration[];
  myCelebrations?: { birthday: boolean; anniversary: boolean; newJoiner: boolean } | null;
  onMyCelebrations?: (v: { birthday: boolean; anniversary: boolean; newJoiner: boolean }) => Promise<unknown>;
  /** A moderator switches approval on a location or department space. */
  onApproval?: (spaceId: string, approval: boolean) => Promise<unknown>;
  /** Stories and tests only. */
  start?: { tab?: 'feed' | 'spaces' };
}

const KIND = { company: 'Company', location: 'Location', department: 'Department' } as const;
const policy = (s: LiveSpace) => (s.kind === 'company' ? 'Announcers post; others need approval' : s.approval ? 'Pre-approval on' : 'Everyone posts');

export function LiveFeedScreen({ live }: { live: LiveFeed }) {
  const { toast } = useToast();
  const [reported, setReported] = useState(false);
  const [thread, setThread] = useState<{ id: string; title: string } | null>(null);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const openThread = (id: string, title: string) => {
    setThread({ id, title });
    setComments(null);
    void live.loadComments?.(id).then(setComments, (e: unknown) => (toast({ tone: 'error', title: errorText(e) }), setComments([])));
  };
  const announcements: FeedPost[] = live.posts.map((p) => ({
    id: p.id,
    type: 'Announcement',
    author: p.author,
    authorNote: p.authorLeft ? 'Former employee' : undefined,
    space: 'Company',
    at: new Date(p.at),
    body: (
      <>
        <strong>{p.title}</strong>
        <MessageBody html={p.body} />
      </>
    ),
    pinned: p.pinned,
    reactions: 0,
    comments: 0,
    ack: p.ack ? { required: true, done: p.ack.done, due: p.ack.due ? new Date(`${p.ack.due}T00:00:00`) : undefined } : undefined,
  }));
  const updates = (live.updates ?? []).map((u) => ({
    src: u,
    post: {
      id: u.id,
      type: (u.kudos ? 'Kudos' : u.poll ? 'Poll' : 'Update') as FeedPost['type'],
      ...(u.poll ? { poll: { question: u.body, options: u.poll.options, votes: u.poll.votes ?? u.poll.options.map(() => 0), myVote: u.poll.myVote, closes: new Date(`${u.poll.closesOn}T00:00:00`), closed: u.poll.closed } } : {}),
      ...(u.kudos ? { to: u.kudos.to, value: u.kudos.badge ? `${u.kudos.value} · ${u.kudos.badge}` : u.kudos.value } : {}),
      author: u.author,
      authorNote: u.authorLeft ? 'Former employee' : undefined,
      space: u.space,
      at: new Date(u.at),
      body: u.poll ? null : <span className="yx-growth-pre">{u.body}</span>,
      reactions: u.likes,
      reacted: u.liked,
      comments: u.comments,
      state: u.state === 'held' ? ('Held' as const) : u.state === 'pending' ? ('Pending' as const) : undefined,
    },
  }));
  const shownSpace = live.spaces?.find((s) => s.id === live.space);
  const ack = (id: string) =>
    live.onAck(id).then(
      () => toast({ tone: 'success', title: 'Acknowledged.' }),
      (e: unknown) => {
        toast({ tone: 'error', title: errorText(e) });
        throw e;
      },
    );
  const report = (id: string) =>
    void live.onReport?.(id).then(
      () => setReported(true),
      (e: unknown) => toast({ tone: 'error', title: errorText(e) }),
    );
  const pinned = shownSpace ? [] : announcements.filter((p) => p.pinned);
  const rest = shownSpace ? [] : announcements.filter((p) => !p.pinned);
  const empty = pinned.length + rest.length + updates.length === 0;
  const feed =
    live.state === 'error' ? (
      <ErrorState title="We couldn't load the feed." description="Try again in a moment." onRetry={live.onRetry} />
    ) : live.state === 'loading' ? (
      <div className="yx-growth-stack">
        <Skeleton height={140} />
        <Skeleton height={180} />
      </div>
    ) : empty ? (
      <EmptyState title={shownSpace ? 'No posts in this space yet' : 'Your feed is empty'} description="Share an update or read the company's announcements here." action={live.onWrite ? <Button icon={Plus} onClick={live.onWrite}>Write a post</Button> : undefined} />
    ) : (
      <div className="yx-growth-stack" aria-live="polite">
        {reported && (
          <InlineAlert tone="success" title="Thanks for reporting">
            A moderator will review it. Posts with enough reports are hidden until reviewed.
          </InlineAlert>
        )}
        {pinned.map((p) => (
          <PostCard key={p.id} post={p} now={live.now} social={false} onAck={() => ack(p.id)} />
        ))}
        {updates.map(({ src, post }) => (
          <PostCard
            key={post.id}
            post={post}
            now={live.now}
            social={src.state === 'published'}
            onLike={live.onLike ? () => live.onLike!(src.id) : undefined}
            onComment={live.loadComments ? () => openThread(src.id, `${src.author} in ${src.space}`) : undefined}
            onReport={!src.mine && src.state === 'published' && live.onReport ? () => report(src.id) : undefined}
            onVote={live.onVote && src.state === 'published' ? (i) => void live.onVote!(src.id, i).catch((e: unknown) => toast({ tone: 'error', title: errorText(e) })) : undefined}
          />
        ))}
        {rest.map((p) => (
          <PostCard key={p.id} post={p} now={live.now} social={false} onAck={() => ack(p.id)} />
        ))}
      </div>
    );
  const spaceFilter = live.spaces && live.onSpace && (
    <Select aria-label="Space" placeholder="All my spaces" clearable value={live.space ?? null} onChange={(v) => live.onSpace!(v)} options={live.spaces.map((s) => ({ value: s.id, label: s.name, description: KIND[s.kind] }))} />
  );
  const directory = (
    <DataTable
      label="Spaces"
      rows={live.directory ?? []}
      state={live.directory === null ? 'loading' : 'ready'}
      getRowId={(r) => r.id}
      empty={<EmptyState compact title="No spaces" />}
      columns={[
        { key: 'name', header: 'Space', value: (r) => r.name, width: 240 },
        { key: 'kind', header: 'Type', value: (r) => KIND[r.kind], groupable: true, width: 160 },
        { key: 'members', header: 'Members', type: 'number', value: (r) => r.members ?? 0, width: 110 },
        { key: 'policy', header: 'Who can post', value: (r) => policy(r), width: 280 },
        { key: 'joined', header: 'You', type: 'status', value: (r) => (r.joined ? 'Member' : 'Not in this group'), statusTone: (v) => (v === 'Member' ? 'success' : 'neutral'), width: 150 },
      ]}
      rowButtons={(r) =>
        live.onApproval && r.kind !== 'company' ? (
          <Button size="sm" onClick={() => void live.onApproval!(r.id, !r.approval).then(() => toast({ tone: 'success', title: r.approval ? `Approval turned off for ${r.name}.` : `Approval turned on for ${r.name}.` }), (e: unknown) => toast({ tone: 'error', title: errorText(e) }))}>
            {r.approval ? 'Turn off approval' : 'Turn on approval'}
          </Button>
        ) : null
      }
    />
  );
  return (
    <GrowthFrame area="engage" active="Feed" persona={live.persona ?? 'emp'}>
      <PageHeader
        title="Feed"
        actions={
          live.onWrite && (
            <Button variant="primary" icon={Plus} onClick={live.onWrite}>
              Write a post
            </Button>
          )
        }
      />
      <Tabs defaultValue={live.start?.tab ?? 'feed'}>
        <TabsList aria-label="Feed">
          <TabsTrigger value="feed">Feed</TabsTrigger>
          {live.directory !== undefined && (
            <TabsTrigger value="spaces" count={live.directory?.length}>
              Spaces
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="feed">
          <div className="yx-growth-feed">
            <div className="yx-growth-stack">
              {spaceFilter}
              {feed}
            </div>
            {((live.spaces && live.spaces.length > 0) || live.openSurvey || live.celebrations?.length || live.myCelebrations) && (
              <aside className="yx-growth-stack">
                {live.celebrations && <CelebrationStrip items={live.celebrations} />}
                {live.openSurvey && (
                  <Card title="Open survey">
                    <Text>{live.openSurvey.name}</Text>
                    <Text size="sm" tone="secondary">
                      {live.openSurvey.questions} questions · {live.openSurvey.anonymous ? 'anonymous' : 'named'} · closes {formatDate(new Date(`${live.openSurvey.closesOn}T00:00:00`))}
                    </Text>
                    <Button size="sm" onClick={() => live.onTakeSurvey?.(live.openSurvey!.id)}>
                      Take survey
                    </Button>
                  </Card>
                )}
                {live.spaces && live.spaces.length > 0 && <Card title="My spaces">
                  <ul className="yx-growth-list">
                    {live.spaces.map((s) => (
                      <li key={s.id} className="yx-growth-list__item">
                        <Link
                          href={`#${s.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            live.onSpace?.(s.id);
                          }}
                        >
                          {s.name}
                        </Link>
                        <span className="yx-growth-meta">{KIND[s.kind]}</span>
                      </li>
                    ))}
                  </ul>
                </Card>}
                {live.myCelebrations && live.onMyCelebrations && (
                  <Card title="My celebrations">
                    <CelebrationChoices value={live.myCelebrations} onChange={(v) => live.onMyCelebrations!(v).then(() => toast({ tone: 'success', title: 'Saved.' }), (e: unknown) => toast({ tone: 'error', title: errorText(e) }))} />
                  </Card>
                )}
              </aside>
            )}
          </div>
        </TabsContent>
        {live.directory !== undefined && <TabsContent value="spaces">{directory}</TabsContent>}
      </Tabs>
      {thread && (
        <CommentsDrawer
          open
          onClose={() => setThread(null)}
          title={thread.title}
          comments={comments}
          onAdd={async (text) => {
            const out = await live.onComment!(thread.id, text);
            toast({ tone: out.held ? 'warning' : 'success', title: out.held ? 'Your comment is held for review: it has a word on the blocked list.' : 'Comment added.' });
            setComments(await live.loadComments!(thread.id));
          }}
          onReport={(id) => live.onReportComment!(id)}
        />
      )}
    </GrowthFrame>
  );
}

/* ------------------------------------------------------------------ ENG-02 composer */

export interface LivePostComposer {
  spaces: LiveSpace[];
  blockedWords: string[];
  /** engage.announce: posts on the company space without approval. */
  canAnnounce: boolean;
  defaultSpace?: string | null;
  onPost: (spaceId: string, body: string, poll?: { options: string[]; closesOn: string }) => Promise<{ state: 'published' | 'pending' | 'held' }>;
  today?: Date;
  onClose: () => void;
}

export function LivePostComposerScreen({ live }: { live: LivePostComposer }) {
  const { toast } = useToast();
  const [space, setSpace] = useState<string | null>(live.defaultSpace ?? live.spaces.find((s) => s.kind !== 'company')?.id ?? live.spaces[0]?.id ?? null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'Update' | 'Poll'>('Update');
  const [options, setOptions] = useState(['', '']);
  const [closes, setCloses] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const sp = live.spaces.find((s) => s.id === space);
  const check = moderate([text, ...(kind === 'Poll' ? options : [])].join(' '), 0, live.blockedWords);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const today = live.today ?? new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const needsApproval = sp ? (sp.kind === 'company' ? !live.canAnnounce : sp.approval) : false;
  const early = useTooEarly([
    ...(!space ? [{ fieldId: 'pc-space', message: 'Choose the space.' }] : []),
    ...(!text.trim() ? [{ fieldId: 'pc-text', message: kind === 'Poll' ? 'Write the question.' : 'Write the post.' }] : []),
    ...(kind === 'Poll' && filled.length < 2 ? [{ fieldId: 'pc-opt-0', message: 'Add at least 2 options.' }] : []),
    ...(kind === 'Poll' && !closes ? [{ fieldId: 'pc-closes', message: 'Choose the day the poll closes.' }] : []),
  ]);
  const send = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      const out = await live.onPost(space!, text.trim(), kind === 'Poll' ? { options: filled, closesOn: iso(closes!) } : undefined);
      toast({ tone: out.state === 'published' ? 'success' : 'warning', title: out.state === 'published' ? 'Posted.' : out.state === 'pending' ? 'Sent for approval. You’ll be told when it appears.' : 'Your post is held for review. A moderator will check it.' });
      live.onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <GrowthFrame area="engage" active="Feed" persona="emp">
      <PageHeader title="Feed" />
      <Drawer
        open
        onOpenChange={(o) => !o && live.onClose()}
        title="New post"
        dirty={text.length > 0}
        footer={
          <div className="yx-growth-foot">
            <Button onClick={live.onClose}>Cancel</Button>
            <Button variant="primary" icon={Send} loading={busy} onClick={() => void send()}>
              {needsApproval ? 'Send for approval' : 'Post'}
            </Button>
          </div>
        }
      >
        <div className="yx-growth-stack">
          {failed && <InlineAlert tone="danger" title="Not posted">{failed}</InlineAlert>}
          <RadioGroup aria-label="Post type" orientation="horizontal" value={kind} onChange={(v) => setKind(v as 'Update' | 'Poll')} options={[{ value: 'Update', label: 'Update' }, { value: 'Poll', label: 'Poll' }]} />
          <FormField id="pc-space" label="Space" required error={early.errorOf('pc-space')} helper={sp ? policy(sp) : undefined}>
            <Select value={space} onChange={setSpace} options={live.spaces.map((s) => ({ value: s.id, label: s.name, description: policy(s) }))} />
          </FormField>
          <FormField id="pc-text" label={kind === 'Poll' ? 'Question' : 'Post'} required error={early.errorOf('pc-text')}>
            <TextArea value={text} onChange={setText} rows={kind === 'Poll' ? 2 : 5} maxLength={3000} />
          </FormField>
          {kind === 'Poll' && (
            <>
              {options.map((o, i) => (
                <FormField key={i} id={`pc-opt-${i}`} label={`Option ${i + 1}`} error={i === 0 ? early.errorOf('pc-opt-0') : null}>
                  <TextField value={o} onChange={(v) => setOptions((xs) => xs.map((x, j) => (j === i ? v : x)))} maxLength={100} />
                </FormField>
              ))}
              {options.length < 5 && (
                <Button size="sm" icon={Plus} onClick={() => setOptions((xs) => [...xs, ''])}>
                  Add option
                </Button>
              )}
              <FormField id="pc-closes" label="Poll closes" required error={early.errorOf('pc-closes')}>
                <DatePicker value={closes} onChange={setCloses} min={today} max={new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90)} />
              </FormField>
            </>
          )}
          {check.state === 'Held' && (
            <InlineAlert tone="warning" title="This post will be held for review">
              It contains a word on the company’s blocked list ({check.reason?.replace('Blocked word ', '')}). Edit it, or post and a moderator will decide.
            </InlineAlert>
          )}
          <div className="yx-growth-effect" aria-live="polite">
            <span className="yx-growth-effect__title">When you post</span>
            <ul>
              <li>{needsApproval ? `A moderator approves it before it appears in ${sp?.name}.` : `It appears in ${sp?.name ?? 'the space'} straight away.`}</li>
              <li>Members of the space see it in their feed.</li>
              {kind === 'Poll' && <li>Results show to each person after they vote.</li>}
            </ul>
          </div>
        </div>
      </Drawer>
    </GrowthFrame>
  );
}

/* ------------------------------------------------------------------ ENG-11 moderation */

export interface LiveModItem {
  id: string;
  kind: 'post' | 'comment';
  author: string;
  space: string;
  text: string;
  reason: string;
  reports: number;
  state: 'pending' | 'held' | 'hidden';
  at: string;
  priorActions: number;
}
export interface LiveModeration {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  items: LiveModItem[];
  onAct: (item: LiveModItem, action: 'approve' | 'restore' | 'hide' | 'delete' | 'warn', note?: string) => Promise<unknown>;
  /** Answer 2666: tell HR about a repeat author (the name and the count, never the words). */
  onRouteToHr?: (item: LiveModItem) => Promise<unknown>;
  /** Stories and tests only. */
  start?: { open?: string };
}

const STATE_WORD = { pending: 'Waiting', held: 'Held', hidden: 'Hidden' } as const;

export function LiveModerationScreen({ live }: { live: LiveModeration }) {
  const { toast } = useToast();
  const [open, setOpen] = useState<string | null>(live.start?.open ?? null);
  const [del, setDel] = useState(false);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const cur = live.items.find((i) => i.id === open);
  const DONE = { approve: 'Approved and published.', restore: 'Restored.', hide: 'Kept hidden.', delete: 'Deleted.', warn: 'Warning sent to the author.' } as const;
  const act = async (item: LiveModItem, action: keyof typeof DONE) => {
    if (action === 'warn' && !note.trim()) {
      setTried(true);
      return void setTimeout(() => document.getElementById('md-note')?.focus(), 0);
    }
    try {
      await live.onAct(item, action, note.trim() || undefined);
      toast({ tone: 'success', title: DONE[action] });
      setNote('');
      setTried(false);
      if (action !== 'warn') setOpen(null);
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };
  if (live.state === 'no-access')
    return (
      <GrowthFrame area="engage" active="Moderation" persona="mod">
        <PageHeader title="Moderation" />
        <NoAccessState what="the moderation queue" grantedBy="your System Admin" />
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Moderation" persona="mod" counts={{ Moderation: live.items.length }}>
      <PageHeader title="Moderation" description="Posts and comments held by the blocked-word filter, hidden after reports, or waiting for approval. Every action is recorded." facts={`${live.items.length} waiting`} />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the queue." description="Try again in a moment." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Moderation queue"
          rows={live.items}
          getRowId={(r) => r.id}
          state={live.state === 'loading' ? 'loading' : 'ready'}
          onRowClick={(r) => (setOpen(r.id), setNote(''), setTried(false))}
          activeRowId={open}
          empty={<EmptyState title="Nothing to review" description="Held, reported and waiting posts appear here." />}
          columns={[
            { key: 'text', header: 'Content', value: (r) => r.text, width: 320 },
            { key: 'kind', header: 'Type', value: (r) => (r.kind === 'post' ? 'Post' : 'Comment'), width: 100 },
            { key: 'author', header: 'Author', type: 'person', value: (r) => r.author, person: (r) => ({ name: r.author }), width: 190 },
            { key: 'space', header: 'Space', value: (r) => r.space, width: 160 },
            { key: 'reason', header: 'Why', value: (r) => r.reason, width: 200 },
            { key: 'state', header: 'State', type: 'status', value: (r) => STATE_WORD[r.state], statusTone: (v) => (v === 'Hidden' ? 'danger' : 'warning'), width: 110 },
            { key: 'at', header: 'When', type: 'date', value: (r) => new Date(r.at), width: 120 },
          ]}
          rowActions={(r) => (
            <>
              <MenuItem icon={RotateCcw} onSelect={() => void act(r, r.state === 'pending' ? 'approve' : 'restore')}>
                {r.state === 'pending' ? 'Approve' : 'Restore'}
              </MenuItem>
              <MenuItem icon={EyeOff} onSelect={() => void act(r, 'hide')}>
                Keep hidden
              </MenuItem>
              <MenuItem icon={Trash2} destructive onSelect={() => (setOpen(r.id), setDel(true))}>
                Delete
              </MenuItem>
            </>
          )}
        />
      )}
      {cur && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={`${cur.kind === 'post' ? 'Post' : 'Comment'} by ${cur.author}`}
          subtitle={`${cur.space} · ${formatDate(new Date(cur.at))}`}
          meta={<Badge tone={cur.state === 'hidden' ? 'danger' : 'warning'}>{STATE_WORD[cur.state]}</Badge>}
          footer={
            <div className="yx-growth-foot" data-split="">
              <Button variant="danger" icon={Trash2} onClick={() => setDel(true)}>
                Delete
              </Button>
              <span className="yx-growth-row">
                <Button icon={EyeOff} onClick={() => void act(cur, 'hide')}>
                  Keep hidden
                </Button>
                <Button variant="primary" icon={Eye} onClick={() => void act(cur, cur.state === 'pending' ? 'approve' : 'restore')}>
                  {cur.state === 'pending' ? 'Approve' : 'Restore'}
                </Button>
              </span>
            </div>
          }
        >
          <div className="yx-growth-stack">
            <blockquote className="yx-growth-note">{cur.text}</blockquote>
            <dl className="yx-growth-facts">
              <div>
                <dt>Why it’s here</dt>
                <dd>{cur.reason}</dd>
              </div>
              <div>
                <dt>Reports</dt>
                <dd>{cur.reports}</dd>
              </div>
              <div>
                <dt>Earlier actions on this author</dt>
                <dd>{cur.priorActions}</dd>
              </div>
            </dl>
            {cur.priorActions >= 2 && (
              <InlineAlert
                tone="warning"
                title="Repeat pattern"
                actions={
                  live.onRouteToHr ? (
                    <Button size="sm" icon={UserX} onClick={() => void live.onRouteToHr!(cur).then(() => toast({ tone: 'success', title: `HR is told about ${cur.author}. They see the name and the count, not the post.` }), (e: unknown) => toast({ tone: 'error', title: errorText(e) }))}>
                      Route to HR
                    </Button>
                  ) : undefined
                }
              >
                {cur.author} has {cur.priorActions} earlier moderation actions. HR can decide on further steps.
              </InlineAlert>
            )}
            <FormField id="md-note" label="Note to the author" optional helper="Sent with Warn author." error={tried && !note.trim() ? 'Write the note first.' : null}>
              <TextArea value={note} onChange={setNote} rows={3} maxLength={1000} />
            </FormField>
            <Text size="sm" tone="secondary">
              The author is told when a post is approved, hidden or removed.
            </Text>
            <Button icon={Flag} onClick={() => void act(cur, 'warn')}>
              Warn author
            </Button>
          </div>
        </Drawer>
      )}
      {cur && (
        <ConfirmDialog
          open={del}
          onOpenChange={setDel}
          destructive
          title={`Delete this ${cur.kind} by ${cur.author}?`}
          consequence="It is removed for everyone and can’t be restored. The deletion and your name stay in the audit log."
          confirmLabel={`Delete ${cur.kind}`}
          onConfirm={async () => {
            await live.onAct(cur, 'delete', note.trim() || undefined);
            toast({ tone: 'success', title: DONE.delete });
            setOpen(null);
          }}
        />
      )}
    </GrowthFrame>
  );
}
