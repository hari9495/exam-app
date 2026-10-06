// Engage: feed + spaces (ENG-01), post composer (ENG-02), announcement composer + acknowledgement tracking (ENG-03),
// moderation queue (ENG-11).
import { useMemo, useState } from 'react';
import { Bell, Cake, Eye, EyeOff, Flag, Gift, ImagePlus, Megaphone, PartyPopper, Plus, RotateCcw, Send, Trash2, UserX } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
import { FieldRow, FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { RichTextEditor } from '../../components/editor';
import { MenuItem } from '../../components/menu';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { TODAY } from '../_kit/data';
import { GrowthFrame, PostCard, type Device, type FeedPost } from './growth-kit';
import { moderate } from './growth-logic';
import type { LoadState } from './perf-goals';
import './growth.css';

/* ================================================================== ENG-01 · Feed + spaces directory */

export interface Space {
  id: string;
  name: string;
  kind: 'Company' | 'Entity' | 'Location' | 'Department' | 'Team' | 'Interest group';
  members: number;
  policy: 'Everyone posts' | 'Announcers post; others need approval' | 'Pre-approval on';
  joined: boolean;
}

export interface Celebration {
  id: string;
  name: string;
  kind: 'Birthday' | 'Work anniversary' | 'New joiner' | 'Promotion';
  detail: string;
}

export interface FeedProps {
  device?: Device;
  persona?: 'emp' | 'hr' | 'mgr';
  posts: FeedPost[];
  spaces: Space[];
  celebrations: Celebration[];
  openSurvey?: { title: string; closes: Date; minutes: number } | null;
  tab?: 'feed' | 'spaces';
  space?: string | null;
  heldNotice?: string;
  state?: LoadState;
}

const CELEB_ICON = { Birthday: Cake, 'Work anniversary': PartyPopper, 'New joiner': Plus, Promotion: Gift };

function CelebrationStrip({ items }: { items: Celebration[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Celebrations today" className="yx-growth-stack" data-gap="sm">
      <h2 className="yx-growth-h">Today</h2>
      {/* Scrolls sideways, so it is a focusable, labelled region (keyboard users can scroll it). */}
      <div className="yx-growth-strip" tabIndex={0} role="region" aria-label="Celebrations today, scroll sideways for more">
        <ul className="yx-growth-strip__list">
        {items.map((c) => (
          <li key={c.id} className="yx-growth-strip__item">
            <PersonLabel name={c.name} />
            <span className="yx-growth-meta">
              <Icon icon={CELEB_ICON[c.kind]} /> {c.detail}
            </span>
          </li>
        ))}
        </ul>
      </div>
    </section>
  );
}

/** ENG-01 Feed (T2): space filter, pinned announcements, polls, celebrations, kudos; spaces directory. */
export function FeedScreen({ device = 'desktop', persona = 'emp', posts, spaces, celebrations, openSurvey, tab = 'feed', space: spaceProp = null, heldNotice, state = 'ready' }: FeedProps) {
  const [space, setSpace] = useState<string | null>(spaceProp);
  const [reported, setReported] = useState<string | null>(null);
  const shown = useMemo(() => posts.filter((p) => !space || p.space === spaces.find((s) => s.id === space)?.name), [posts, space, spaces]);
  const pinned = shown.filter((p) => p.pinned);
  const rest = shown.filter((p) => !p.pinned);
  const spaceFilter = (
    <Select aria-label="Space" placeholder="All my spaces" clearable value={space} onChange={setSpace} options={spaces.filter((s) => s.joined).map((s) => ({ value: s.id, label: s.name, description: s.kind }))} />
  );
  const surveyCard = openSurvey && (
    <Card title="Open survey">
      <Text>{openSurvey.title}</Text>
      <Text size="sm" tone="secondary">
        About {openSurvey.minutes} minutes · anonymous · closes {formatDate(openSurvey.closes)}
      </Text>
      <Button size="sm">Take survey</Button>
    </Card>
  );
  const feed =
    state === 'loading' ? (
      <div className="yx-growth-stack">
        <Skeleton height={140} />
        <Skeleton height={180} />
      </div>
    ) : shown.length === 0 ? (
      <EmptyState title={space ? 'No posts in this space yet' : 'Your feed is empty'} description="Share an update, start a poll or thank a colleague." action={<Button icon={Plus}>Write a post</Button>} />
    ) : (
      <div className="yx-growth-stack" aria-live="polite">
        {heldNotice && (
          <InlineAlert tone="warning" title="Your post is held for review">
            {heldNotice} A moderator will check it; you’ll be told the outcome.
          </InlineAlert>
        )}
        {reported && (
          <InlineAlert tone="success" title="Thanks for reporting">
            A moderator will review it. Posts with 3 reports are hidden until reviewed.
          </InlineAlert>
        )}
        {pinned.map((p) => (
          <PostCard key={p.id} post={p} now={TODAY} />
        ))}
        {rest.map((p) => (
          <PostCard key={p.id} post={p} now={TODAY} onReport={() => setReported(p.id)} />
        ))}
      </div>
    );
  const directory = (
    <DataTable
      label="Spaces"
      rows={spaces}
      getRowId={(r) => r.id}
      empty={<EmptyState compact title="No spaces" />}
      columns={[
        { key: 'name', header: 'Space', value: (r) => r.name, width: 240 },
        { key: 'kind', header: 'Type', value: (r) => r.kind, groupable: true, width: 160 },
        { key: 'members', header: 'Members', type: 'number', value: (r) => r.members, width: 110 },
        { key: 'policy', header: 'Who can post', value: (r) => r.policy, width: 280 },
        { key: 'joined', header: 'You', type: 'status', value: (r) => (r.joined ? 'Member' : r.kind === 'Interest group' ? 'Not joined' : 'Not in this group'), statusTone: (v) => (v === 'Member' ? 'success' : 'neutral'), width: 150 },
      ]}
      rowButtons={(r) => (!r.joined && r.kind === 'Interest group' ? <Button size="sm">Join</Button> : null)}
    />
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="engage" active="Feed" persona={persona} device="phone" phone={{ tab: 'home', title: 'Home' }}>
        <CelebrationStrip items={celebrations} />
        {surveyCard}
        {spaceFilter}
        {feed}
        <div className="yx-growth-pinned">
          <Button variant="primary" fullWidth icon={Gift}>
            Give kudos
          </Button>
        </div>
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Feed" persona={persona} counts={{ Surveys: openSurvey ? 1 : 0 }}>
      <PageHeader
        title="Feed"
        actions={
          <>
            <Button icon={Gift}>Give kudos</Button>
            <Button variant="primary" icon={Plus}>
              Write a post
            </Button>
          </>
        }
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Feed">
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="spaces" count={spaces.length}>
            Spaces
          </TabsTrigger>
        </TabsList>
        <TabsContent value="feed">
          <div className="yx-growth-feed">
            <div className="yx-growth-stack">
              {spaceFilter}
              {feed}
            </div>
            <aside className="yx-growth-stack">
              <CelebrationStrip items={celebrations} />
              {surveyCard}
              <Card title="My spaces">
                <ul className="yx-growth-list">
                  {spaces
                    .filter((s) => s.joined)
                    .map((s) => (
                      <li key={s.id} className="yx-growth-list__item">
                        <Link
                          href={`#${s.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setSpace(s.id);
                          }}
                        >
                          {s.name}
                        </Link>
                        <span className="yx-growth-meta">{s.members}</span>
                      </li>
                    ))}
                </ul>
              </Card>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="spaces">{directory}</TabsContent>
      </Tabs>
    </GrowthFrame>
  );
}

/* ================================================================== ENG-02 · Post composer */

export interface PostComposerProps {
  device?: Device;
  kind?: 'Update' | 'Poll' | 'Event';
  spaces: Space[];
  defaultSpace?: string;
  defaultText?: string;
  blockedWords: string[];
}

/** ENG-02 Post composer (T4): update, poll or event; space by posting policy; moderation check before posting (YX-ENG-02/03). */
export function PostComposerScreen({ device = 'desktop', kind: kind0 = 'Update', spaces, defaultSpace, defaultText = '', blockedWords }: PostComposerProps) {
  const [kind, setKind] = useState(kind0);
  const [space, setSpace] = useState<string | null>(defaultSpace ?? spaces.find((s) => s.joined)?.id ?? null);
  const [text, setText] = useState(defaultText);
  const [options, setOptions] = useState(['Idli and vada', 'Pongal', 'Poori']);
  const [closes, setCloses] = useState<Date | null>(new Date(2026, 9, 3));
  const [evDate, setEvDate] = useState<Date | null>(new Date(2026, 9, 10));
  const sp = spaces.find((s) => s.id === space);
  const check = moderate(text, 0, blockedWords);
  const needsApproval = sp?.policy !== 'Everyone posts';
  const pollError = kind !== 'Poll' ? null : (options.filter((o) => o.trim()).length < 2 ? 'Add at least 2 options.' : options.length > 5 ? 'Use at most 5 options.' : null);
  const body = (
    <div className="yx-growth-stack">
      <RadioGroup aria-label="Post type" orientation="horizontal" value={kind} onChange={(v) => setKind(v as typeof kind)} options={[{ value: 'Update', label: 'Update' }, { value: 'Poll', label: 'Poll' }, { value: 'Event', label: 'Event' }]} />
      <FormField label="Space" required helper={sp ? `${sp.members} members · ${sp.policy}` : undefined}>
        <Select value={space} onChange={setSpace} options={spaces.filter((s) => s.joined).map((s) => ({ value: s.id, label: s.name, description: s.policy }))} />
      </FormField>
      <FormField label={kind === 'Poll' ? 'Question' : kind === 'Event' ? 'What’s happening' : 'Post'} required>
        <TextArea value={text} onChange={setText} rows={kind === 'Update' ? 5 : 2} />
      </FormField>
      {kind === 'Poll' && (
        <>
          {options.map((o, i) => (
            <FormField key={i} label={`Option ${i + 1}`}>
              <TextField value={o} onChange={(v) => setOptions((xs) => xs.map((x, j) => (j === i ? v : x)))} />
            </FormField>
          ))}
          {options.length < 5 && (
            <Button size="sm" icon={Plus} onClick={() => setOptions((xs) => [...xs, ''])}>
              Add option
            </Button>
          )}
          <FormField label="Poll closes" error={pollError}>
            <DatePicker value={closes} onChange={setCloses} min={TODAY} />
          </FormField>
        </>
      )}
      {kind === 'Event' && (
        <FieldRow>
          <FormField label="Date" required>
            <DatePicker value={evDate} onChange={setEvDate} min={TODAY} />
          </FormField>
          <FormField label="Place or link" required>
            <TextField defaultValue="Hosur plant canteen lawn" />
          </FormField>
        </FieldRow>
      )}
      {kind === 'Update' && (
        <Button icon={ImagePlus} size="sm">
          Add photo
        </Button>
      )}
      {check.state === 'Held' && (
        <InlineAlert tone="warning" title="This post will be held for review">
          It contains a word on the company’s blocked list ({check.reason?.replace('Blocked word ', '')}). Edit it, or post and a moderator will decide.
        </InlineAlert>
      )}
      <div className="yx-growth-effect" aria-live="polite">
        <span className="yx-growth-effect__title">When you post</span>
        <ul>
          <li>{needsApproval ? `An admin approves it before it appears in ${sp?.name}.` : `It appears in ${sp?.name ?? 'the space'} straight away.`}</li>
          <li>Members see it in their feed; only @mentions get a push notification.</li>
          {kind === 'Poll' && <li>Results show to each person after they vote.</li>}
        </ul>
      </div>
    </div>
  );
  const footer = (
    <div className="yx-growth-foot">
      <Button>Cancel</Button>
      <Button variant="primary" icon={Send} disabled={!text.trim() || !!pollError} fullWidth={device === 'phone'}>
        {needsApproval ? 'Send for approval' : 'Post'}
      </Button>
    </div>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="engage" active="Feed" persona="emp" device="phone" phone={{ tab: 'home', title: 'Home' }}>
        <BottomSheet open onOpenChange={() => {}} title="New post" footer={footer}>
          {body}
        </BottomSheet>
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Feed" persona="emp">
      <PageHeader title="Feed" />
      <Drawer open onOpenChange={() => {}} title="New post" footer={footer} dirty={text.length > 0}>
        {body}
      </Drawer>
    </GrowthFrame>
  );
}

/* ================================================================== ENG-03 · Announcement composer + acknowledgement tracking */

export interface AckRow {
  id: string;
  name: string;
  department: string;
  location: string;
  read: Date | null;
  acked: Date | null;
}

const AUDIENCE_COUNTS: Record<string, number> = { everyone: 248, hosur: 96, chennai: 58, blr: 94, ops: 72, quality: 17 };

/** ENG-03 Announcement composer (T4): audience with live count, channels (external ones carry no sensitive values), acknowledgement, schedule; tracking (T2). */
export function AnnouncementScreen({ view, rows = [], sensitive, state = 'ready' }: { view: 'compose' | 'tracking'; rows?: AckRow[]; sensitive?: boolean; state?: LoadState }) {
  const [audience, setAudience] = useState<string[]>(['hosur']);
  const [channels, setChannels] = useState<string[]>(['app', 'push', 'whatsapp']);
  const [ack, setAck] = useState(true);
  const [due, setDue] = useState<Date | null>(new Date(2026, 9, 6));
  const [confirm, setConfirm] = useState(false);
  const [filters, setFilters] = useState<FilterValue[]>([{ key: 'status', type: 'multi', values: ['Not acknowledged'] }]);
  const reach = audience.includes('everyone') ? 248 : audience.reduce((a, x) => a + (AUDIENCE_COUNTS[x] ?? 0), 0);
  const external = channels.some((c) => ['email', 'whatsapp', 'sms'].includes(c));
  const withStatus = rows.map((r) => ({ ...r, status: r.acked ? 'Acknowledged' : r.read ? 'Read, not acknowledged' : 'Not read' }));
  const tracked = withStatus.filter((r) => filters.every((f) => (f.key === 'status' && f.type === 'multi' ? f.values.length === 0 || f.values.some((v) => (v === 'Not acknowledged' ? r.status !== 'Acknowledged' : r.status === v)) : matchesFilter((r as unknown as Record<string, unknown>)[f.key], f))));
  const ackd = rows.filter((r) => r.acked).length;
  const read = rows.filter((r) => r.read).length;
  const fields: FilterFieldDef[] = [
    { key: 'status', label: 'Status', type: 'multi', options: ['Acknowledged', 'Not acknowledged', 'Not read'].map((v) => ({ value: v, label: v })) },
    { key: 'department', label: 'Department', type: 'multi', options: ['Operations', 'Quality', 'Engineering'].map((v) => ({ value: v, label: v })) },
  ];
  const cols: TableColumn<(typeof withStatus)[number]>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.department }), width: 220 },
    { key: 'location', header: 'Location', value: (r) => r.location, width: 160 },
    { key: 'read', header: 'Read', type: 'date', value: (r) => r.read, render: (r) => (r.read ? formatDate(r.read) : 'Not yet'), width: 120 },
    { key: 'acked', header: 'Acknowledged', type: 'date', value: (r) => r.acked, render: (r) => (r.acked ? formatDate(r.acked) : 'Not yet'), width: 140 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Acknowledged' ? 'success' : v === 'Not read' ? 'danger' : 'warning'), width: 200 },
  ];
  if (view === 'tracking')
    return (
      <GrowthFrame area="engage" active="Announcements" persona="hr">
        <PageHeader
          title="Revised canteen hygiene rules, Hosur plant"
          status={<Badge tone="success">Published</Badge>}
          facts={`Published 24 Sep 2026 · ${rows.length} people · acknowledge by 6 Oct 2026`}
          actions={
            <>
              <Button>Export</Button>
              <Button variant="primary" icon={Bell}>
                Remind {rows.length - ackd} people
              </Button>
            </>
          }
        />
        <div className="yx-growth-kpis">
          <Meter label="Read" value={read} max={rows.length || 1} valueText={`${read} of ${rows.length}`} />
          <Meter label="Acknowledged" value={ackd} max={rows.length || 1} valueText={`${ackd} of ${rows.length}`} />
        </div>
        <DataTable
          label="Acknowledgement tracking"
          columns={cols}
          rows={tracked}
          getRowId={(r) => r.id}
          state={state === 'loading' ? 'loading' : 'ready'}
          filtered={filters.length > 0}
          onClearFilters={() => setFilters([])}
          toolbar={<FilterBar fields={fields} value={filters} onChange={setFilters} />}
          empty={<EmptyState compact title="Everyone has acknowledged" />}
        />
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Announcements" persona="hr">
      <PageHeader
        title="New announcement"
        actions={
          <>
            <Button>Save draft</Button>
            <Button variant="primary" icon={Megaphone} onClick={() => setConfirm(true)}>
              Publish to {reach} people
            </Button>
          </>
        }
      />
      <div className="yx-growth-split">
        <div className="yx-growth-split__main">
          <FormField label="Title" required>
            <TextField defaultValue={sensitive ? 'September bonus: ₹12,000 credited' : 'Revised canteen hygiene rules, Hosur plant'} />
          </FormField>
          <FormField label="Message" required>
            <RichTextEditor defaultValue="<p>From 1 October, hairnets and gloves are required in the canteen serving area as well as on the line. Please read the updated rules and acknowledge by 6 October.</p>" mergeFields={[]} />
          </FormField>
          <FormField label="Audience" required helper={`${reach} people right now; people who join the audience later also receive it.`}>
            <MultiSelect
              value={audience}
              onChange={setAudience}
              options={[
                { value: 'everyone', label: 'Everyone' },
                { value: 'hosur', label: 'Location: Hosur plant' },
                { value: 'chennai', label: 'Location: Chennai office' },
                { value: 'blr', label: 'Location: Bengaluru head office' },
                { value: 'ops', label: 'Department: Operations' },
                { value: 'quality', label: 'Department: Quality' },
              ]}
            />
          </FormField>
          <FormField label="Channels">
            <div className="yx-growth-stack" data-gap="sm">
              {[
                ['app', 'In-app and mobile Home', 'Always on'],
                ['push', 'Push notification', ''],
                ['email', 'Email', ''],
                ['whatsapp', 'WhatsApp (company number)', 'Title and link only'],
                ['sms', 'SMS', 'Title and link only'],
              ].map(([v, l, d]) => (
                <Checkbox key={v} checked={channels.includes(v)} disabled={v === 'app'} onChange={(c) => setChannels((xs) => (c ? [...xs, v] : xs.filter((x) => x !== v)))} label={l} description={d || undefined} />
              ))}
            </div>
          </FormField>
          {sensitive && external && (
            <InlineAlert tone="danger" title="Remove the amount before sending outside the app">
              Email, WhatsApp and SMS never carry pay amounts or other confidential values. Change the title, or send in-app only.
            </InlineAlert>
          )}
        </div>
        <aside className="yx-growth-split__side">
          <Card title="Acknowledgement">
            <div className="yx-growth-stack">
              <Switch checked={ack} onChange={setAck} label="Ask people to acknowledge" description="Tracked per person, with reminders." />
              {ack && (
                <FormField label="Acknowledge by">
                  <DatePicker value={due} onChange={setDue} min={TODAY} />
                </FormField>
              )}
            </div>
          </Card>
          <Card title="Schedule">
            <div className="yx-growth-stack">
              <RadioGroup aria-label="When" defaultValue="now" options={[{ value: 'now', label: 'Publish now' }, { value: 'later', label: 'Schedule for later' }]} />
            <Switch defaultChecked label="Pin to the top of the feed" />
            <Switch label="Mirror to the plant chat channel" description="Title and a link back; comments stay in YukthiX." />
            </div>
          </Card>
        </aside>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Publish to ${reach} people?`}
        consequence={`Sent by ${channels.length} channels. ${ack ? `Everyone is asked to acknowledge by ${formatDate(due)}.` : ''} You can’t unsend; you can edit or expire it later.`}
        confirmLabel="Publish announcement"
        confirmDisabled={sensitive && external}
        onConfirm={() => setConfirm(false)}
      />
    </GrowthFrame>
  );
}

/* ================================================================== ENG-11 · Moderation queue */

export interface ModItem {
  id: string;
  kind: 'Post' | 'Comment';
  author: string;
  space: string;
  text: string;
  reason: string;
  reports: number;
  state: 'Held' | 'Hidden';
  at: Date;
  priorActions: number;
}

/** ENG-11 Moderation queue (T2): held and reported items; restore, hide, delete (confirmed), warn; repeat offenders to HR. All actions audited. */
export function ModerationScreen({ items: initial, openId, deleteOpen, state = 'ready' }: { items: ModItem[]; openId?: string; deleteOpen?: boolean; state?: LoadState }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [del, setDel] = useState(!!deleteOpen);
  const [note, setNote] = useState('');
  const cur = items.find((i) => i.id === open);
  const resolve = (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    setOpen(null);
  };
  return (
    <GrowthFrame area="engage" active="Moderation" persona="mod" counts={{ Moderation: items.length }}>
      <PageHeader title="Moderation" description="Posts and comments held by the blocked-word filter or hidden after 3 reports. Every action is recorded." facts={`${items.length} waiting`} />
      <DataTable
        label="Moderation queue"
        rows={items}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : 'ready'}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
        empty={<EmptyState title="Nothing to review" description="Held and reported posts appear here." />}
        columns={[
          { key: 'text', header: 'Content', value: (r) => r.text, width: 320 },
          { key: 'kind', header: 'Type', value: (r) => r.kind, width: 100 },
          { key: 'author', header: 'Author', type: 'person', value: (r) => r.author, person: (r) => ({ name: r.author }), width: 190 },
          { key: 'space', header: 'Space', value: (r) => r.space, width: 160 },
          { key: 'reason', header: 'Why', value: (r) => r.reason, width: 200 },
          { key: 'state', header: 'State', type: 'status', value: (r) => r.state, statusTone: (v) => (v === 'Held' ? 'warning' : 'danger'), width: 110 },
          { key: 'at', header: 'When', type: 'date', value: (r) => r.at, width: 120 },
        ]}
        rowActions={(r) => (
          <>
            <MenuItem icon={RotateCcw} onSelect={() => resolve(r.id)}>
              Restore
            </MenuItem>
            <MenuItem icon={EyeOff} onSelect={() => resolve(r.id)}>
              Keep hidden
            </MenuItem>
            <MenuItem icon={Trash2} destructive onSelect={() => { setOpen(r.id); setDel(true); }}>
              Delete
            </MenuItem>
          </>
        )}
      />
      {cur && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={`${cur.kind} by ${cur.author}`}
          subtitle={`${cur.space} · ${formatDate(cur.at)}`}
          meta={<Badge tone={cur.state === 'Held' ? 'warning' : 'danger'}>{cur.state}</Badge>}
          footer={
            <div className="yx-growth-foot" data-split="">
              <Button variant="danger" icon={Trash2} onClick={() => setDel(true)}>
                Delete
              </Button>
              <span className="yx-growth-row">
                <Button icon={EyeOff} onClick={() => resolve(cur.id)}>
                  Keep hidden
                </Button>
                <Button variant="primary" icon={Eye} onClick={() => resolve(cur.id)}>
                  Restore
                </Button>
              </span>
            </div>
          }
        >
          <div className="yx-growth-stack">
            <blockquote className="yx-growth-note">{cur.text}</blockquote>
            <DescriptionList2 items={[['Why it’s here', cur.reason], ['Reports', String(cur.reports)], ['Earlier actions on this author', String(cur.priorActions)]]} />
            {cur.priorActions >= 2 && (
              <InlineAlert tone="warning" title="Repeat pattern" actions={<Button size="sm" icon={UserX}>Route to HR</Button>}>
                {cur.author} has {cur.priorActions} earlier moderation actions. HR can decide on further steps.
              </InlineAlert>
            )}
            <FormField label="Note to the author" optional helper="Sent with a warning if you choose Warn author.">
              <TextArea value={note} onChange={setNote} rows={3} />
            </FormField>
            <Button icon={Flag} disabled={!note.trim()}>
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
          title={`Delete this ${cur.kind.toLowerCase()} by ${cur.author}?`}
          consequence="It is removed for everyone and can’t be restored. The deletion, your name and the reason stay in the audit log."
          confirmLabel={`Delete ${cur.kind.toLowerCase()}`}
          onConfirm={() => {
            setDel(false);
            resolve(cur.id);
          }}
        />
      )}
    </GrowthFrame>
  );
}

function DescriptionList2({ items }: { items: [string, string][] }) {
  return (
    <dl className="yx-growth-facts">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

