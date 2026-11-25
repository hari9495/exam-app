import type { LiveAnnouncements } from './engage-announce-live';
import type { LiveFeed, LiveModeration, LivePostComposer, LiveSpace } from './engage-feed-live';
import type { LiveGiveKudos, LiveRecognitionWall } from './engage-recognition-live';

// Batch G2: sample live data for the Engage screens (stories and tests).
export const ENG_TODAY = new Date(2026, 9, 1, 10, 0);

export const liveAnnouncements = (over: Partial<LiveAnnouncements> = {}): LiveAnnouncements => ({
  view: 'list',
  state: 'ready',
  today: ENG_TODAY,
  list: [
    { id: 'a1', title: 'Revised canteen hygiene rules, Hosur plant', publishAt: '2026-09-24T04:30:00Z', scheduled: false, people: 96, read: 81, acknowledged: 64, ackRequired: true, ackDueOn: '2026-10-06', pinned: true },
    { id: 'a2', title: 'Diwali holidays and the plant shutdown', publishAt: '2026-10-05T03:30:00Z', scheduled: true, people: 248, read: 0, acknowledged: 0, ackRequired: false, ackDueOn: null, pinned: false },
  ],
  options: {
    locations: [{ id: 'loc-hsr', name: 'Hosur plant' }, { id: 'loc-blr', name: 'Bengaluru head office' }],
    departments: [{ id: 'dep-ops', name: 'Operations' }, { id: 'dep-q', name: 'Quality' }],
    everyone: 248,
  },
  reach: async (l, d) => (l.length ? 96 : 0) + (d.length ? 17 : 0),
  onPublish: async () => ({ id: 'a3' }),
  detail: {
    id: 'a1',
    title: 'Revised canteen hygiene rules, Hosur plant',
    body: '<p>From 1 October, hairnets and gloves are required in the canteen serving area.</p>',
    publishAt: '2026-09-24T04:30:00Z',
    scheduled: false,
    ackRequired: true,
    ackDueOn: '2026-10-06',
    email: false,
    pinned: true,
    canRemind: true,
    rows: [
      { id: 'u1', name: 'Murugan P.', department: 'Operations', location: 'Hosur plant', read: '2026-09-24T06:00:00Z', acked: '2026-09-24T06:01:00Z' },
      { id: 'u2', name: 'Selvi R.', department: 'Operations', location: 'Hosur plant', read: '2026-09-25T06:00:00Z', acked: null },
      { id: 'u3', name: 'Arun K.', department: 'Quality', location: 'Hosur plant', read: null, acked: null },
    ],
  },
  onRemind: async () => ({ reminded: 2 }),
  ...over,
});

export const liveFeed = (over: Partial<LiveFeed> = {}): LiveFeed => ({
  state: 'ready',
  now: ENG_TODAY,
  posts: [
    { id: 'a1', kind: 'announcement', title: 'Revised canteen hygiene rules, Hosur plant', body: '<p>From 1 October, hairnets and gloves are required in the canteen serving area.</p>', author: 'Rekha Iyengar', authorLeft: false, at: '2026-09-24T04:30:00Z', pinned: true, ack: { due: '2026-10-06', done: false } },
    { id: 'a4', kind: 'announcement', title: 'New bus route from Electronic City', body: '<p>Route 7 starts on Monday.</p>', author: 'Kavya Nair', authorLeft: true, at: '2026-09-20T04:30:00Z', pinned: false, ack: null },
  ],
  onAck: async () => undefined,
  ...over,
});

// Batch G2 item 100: my spaces, updates, the directory, the composer and the moderation queue.
export const ENG_SPACES: LiveSpace[] = [
  { id: 's-co', name: 'Company', kind: 'company', approval: true, members: 248, joined: true },
  { id: 's-hsr', name: 'Hosur plant', kind: 'location', approval: false, members: 96, joined: true },
  { id: 's-ops', name: 'Operations', kind: 'department', approval: true, members: 72, joined: true },
  { id: 's-blr', name: 'Bengaluru head office', kind: 'location', approval: false, members: 94, joined: false },
];

export const liveFeedWithPosts = (over: Partial<LiveFeed> = {}): LiveFeed =>
  liveFeed({
    spaces: ENG_SPACES.filter((s) => s.joined),
    directory: ENG_SPACES,
    space: null,
    onSpace: () => undefined,
    onWrite: () => undefined,
    updates: [
      { id: 'u1', kind: 'update', spaceId: 's-hsr', space: 'Hosur plant', body: 'Line 2 crossed 1,000 safe days today. Thank you all.', author: 'Selvi R.', authorLeft: false, mine: false, at: '2026-10-01T03:00:00Z', state: 'published', likes: 12, liked: false, comments: 2 },
      { id: 'u2', kind: 'update', spaceId: 's-co', space: 'Company', body: 'Cricket nets open on Saturdays from next week.', author: 'Me', authorLeft: false, mine: true, at: '2026-10-01T04:00:00Z', state: 'pending', likes: 0, liked: false, comments: 0 },
    ],
    onLike: async () => undefined,
    onReport: async () => undefined,
    loadComments: async () => [{ id: 'c1', author: 'Arun K.', mine: false, body: 'Well done, team!', at: '2026-10-01T03:30:00Z', held: false }],
    onComment: async () => ({ held: false }),
    onReportComment: async () => undefined,
    ...over,
  });

export const livePostComposer = (over: Partial<LivePostComposer> = {}): LivePostComposer => ({
  spaces: ENG_SPACES.filter((s) => s.joined),
  blockedWords: ['idiot'],
  canAnnounce: false,
  onPost: async () => ({ state: 'published' }),
  onClose: () => undefined,
  ...over,
});

export const liveModeration = (over: Partial<LiveModeration> = {}): LiveModeration => ({
  state: 'ready',
  items: [
    { id: 'm1', kind: 'post', author: 'Ravi K.', space: 'Operations', text: 'The night shift supervisor is an idiot.', reason: 'Blocked word "idiot"', reports: 0, state: 'held', at: '2026-09-30T10:00:00Z', priorActions: 2 },
    { id: 'm2', kind: 'post', author: 'Meena P.', space: 'Company', text: 'Cricket nets open on Saturdays.', reason: 'Needs approval', reports: 0, state: 'pending', at: '2026-10-01T04:00:00Z', priorActions: 0 },
    { id: 'm3', kind: 'comment', author: 'Joseph M.', space: 'Hosur plant', text: 'Buy cheap phones at my link', reason: '3 reports', reports: 3, state: 'hidden', at: '2026-09-29T08:00:00Z', priorActions: 0 },
  ],
  onAct: async () => undefined,
  ...over,
});

// Batch G2 item 73: kudos (badges only) and the wall.
export const liveGiveKudos = (over: Partial<LiveGiveKudos> = {}): LiveGiveKudos => ({
  options: {
    values: ['Customer first', 'Own it', 'Win together'],
    badges: ['Above and beyond', 'Team player'],
    people: [{ id: 'p1', name: 'Meera Iyer' }, { id: 'p2', name: 'Arun K.' }],
  },
  blockedWords: ['idiot'],
  onSend: async () => ({ held: false }),
  onClose: () => undefined,
  ...over,
});

export const liveWall = (over: Partial<LiveRecognitionWall> = {}): LiveRecognitionWall => ({
  state: 'ready',
  now: ENG_TODAY,
  values: [{ value: 'Customer first', count: 1 }, { value: 'Own it', count: 1 }, { value: 'Win together', count: 0 }],
  total: 2,
  kudos: [
    { id: 'k1', from: 'Rekha Iyengar', fromLeft: false, to: ['Meera Iyer'], value: 'Customer first', badge: 'Above and beyond', body: 'Stayed late to close the audit findings.', at: '2026-09-30T10:00:00Z', likes: 4, liked: false, comments: 1, mine: false },
    { id: 'k2', from: 'Arun K.', fromLeft: true, to: ['Selvi R.', 'Murugan P.'], value: 'Own it', badge: null, body: 'Fixed the packing line jam in 20 minutes.', at: '2026-09-28T10:00:00Z', likes: 9, liked: true, comments: 0, mine: false },
  ],
  value: null,
  onValue: () => undefined,
  onGive: () => undefined,
  onLike: async () => undefined,
  ...over,
});
