import type { LiveAnnouncements } from './engage-announce-live';
import type { LiveFeed } from './engage-feed';

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
