import type { LiveCourse, LiveCourseBuilder, LiveMyLearning, LiveNominate, LivePlayer } from './learn-courses-live';
import type { LiveFeedback, LiveMySessions, LiveSessionPage, LiveSessions, LiveTrainerCode } from './learn-sessions-live';

// Batch G3: sample live data for the Learning screens (stories and tests).
export const LRN_TODAY = new Date(2026, 9, 1, 10, 0);

export const FOOD_SAFETY: LiveCourse = {
  id: 'c1',
  title: 'Food safety basics',
  description: null,
  type: 'self_paced',
  durationMinutes: 45,
  cost: 0,
  mandatory: true,
  needsApproval: false,
  certificate: true,
  validMonths: 12,
  skills: [{ skillId: 'sk1', level: 3 }],
  status: 'published',
  items: [
    { id: 'i1', title: 'Hand washing', kind: 'video', minutes: 8, required: true },
    { id: 'i2', title: 'Allergen rules', kind: 'pdf', minutes: 10, required: true },
    { id: 'i3', title: 'Further reading', kind: 'link', url: 'https://example.com', minutes: 5, required: false },
  ],
};
const AUDITOR: LiveCourse = { ...FOOD_SAFETY, id: 'c2', title: 'Auditor prep', mandatory: false, needsApproval: true, certificate: false, validMonths: null, cost: 30000 };

export const liveMyLearning = (over: Partial<LiveMyLearning> = {}): LiveMyLearning => ({
  state: 'ready',
  today: LRN_TODAY,
  enrolments: [
    { id: 'e1', course: FOOD_SAFETY, status: 'enrolled', source: 'rule', dueOn: '2026-10-15', progress: 50, canDecline: false },
    { id: 'e2', course: { ...AUDITOR, needsApproval: false, title: 'Excel for planners', id: 'c3', cost: 0 }, status: 'enrolled', source: 'nominated', dueOn: null, progress: 0, canDecline: true },
    { id: 'e3', course: AUDITOR, status: 'requested', source: 'self', dueOn: null, progress: 0, canDecline: false },
  ],
  certificates: [{ id: 'x1', title: 'Fire safety', issuedOn: '2025-10-02', expiresOn: '2026-10-02' }],
  catalogue: [{ ...FOOD_SAFETY, mine: 'e1' }, { ...AUDITOR, mine: null }, { ...AUDITOR, id: 'c4', title: 'Forklift basics', needsApproval: false, cost: 0, mine: null }],
  onOpen: () => undefined,
  onEnrol: async () => ({ status: 'enrolled' }),
  onDecline: async () => undefined,
  ...over,
});

export const livePlayer = (over: Partial<LivePlayer> = {}): LivePlayer => ({
  state: 'ready',
  data: {
    id: 'e1',
    course: FOOD_SAFETY,
    status: 'enrolled',
    items: [
      { id: 'i1', title: 'Hand washing', kind: 'video', url: null, minutes: 8, required: true, done: true, hasFile: true },
      { id: 'i2', title: 'Allergen rules', kind: 'pdf', url: null, minutes: 10, required: true, done: false, hasFile: true },
      { id: 'i3', title: 'Further reading', kind: 'link', url: 'https://example.com', minutes: 5, required: false, done: false, hasFile: false },
    ],
    certificate: null,
  },
  onOpenFile: async () => undefined,
  onDone: async () => ({ completed: false }),
  ...over,
});

export const liveCourseBuilder = (over: Partial<LiveCourseBuilder> = {}): LiveCourseBuilder => ({
  view: 'list',
  state: 'ready',
  list: [
    { ...FOOD_SAFETY, enrolled: 96, completed: 41, requested: 0 },
    { ...AUDITOR, status: 'draft', enrolled: 0, completed: 0, requested: 2 },
  ],
  course: { ...FOOD_SAFETY, enrolments: [{ id: 'n1', person: 'Meera Iyer', status: 'requested', source: 'self', dueOn: null, reason: null, createdAt: '2026-09-30T10:00:00Z' }, { id: 'n2', person: 'Arun K.', status: 'declined', source: 'nominated', dueOn: '2026-10-15', reason: 'Took it last year.', createdAt: '2026-09-28T10:00:00Z' }] },
  skillOptions: [{ id: 'sk1', name: 'Food hygiene' }, { id: 'sk2', name: 'Allergen control' }],
  onNew: () => undefined,
  onOpen: () => undefined,
  onSave: async () => ({ id: 'c1' }),
  onUpload: async () => undefined,
  onPublish: async () => undefined,
  onDecide: async () => undefined,
  onNominate: () => undefined,
  ...over,
});

export const liveNominate = (over: Partial<LiveNominate> = {}): LiveNominate => ({
  course: { id: 'c1', title: 'Food safety basics', mandatory: true, cost: 0 },
  people: [{ id: 'p1', name: 'Selvi R.' }, { id: 'p2', name: 'Murugan P.' }],
  today: LRN_TODAY,
  onSend: async (ids) => ({ nominated: ids.length }),
  onClose: () => undefined,
  ...over,
});

/* G3b sessions */
const SLOTS = [
  { id: 's1', date: '2026-10-01', start: '09:30', end: '13:00' },
  { id: 's2', date: '2026-10-02', start: '09:30', end: '13:00' },
];
export const SESSION_LIVE_PAGE: LiveSessionPage = {
  id: 'ss1',
  course: 'Forklift safety',
  type: 'classroom',
  venue: 'Hosur training room',
  link: null,
  trainer: 'Divya Rao',
  isLd: true,
  seats: 2,
  status: 'scheduled',
  slots: SLOTS,
  share: 75,
  seated: [
    { userId: 'u1', name: 'Rohit Bhat' },
    { userId: 'u2', name: 'Meena Iyer' },
  ],
  waiting: [{ userId: 'u3', name: 'Arjun Nair' }],
  attendance: [
    { userId: 'u1', name: 'Rohit Bhat', marks: ['present', null], method: 'code' },
    { userId: 'u2', name: 'Meena Iyer', marks: ['late', null], method: 'manual' },
  ],
  results: [
    { userId: 'u1', name: 'Rohit Bhat', attended: 1, ok: false },
    { userId: 'u2', name: 'Meena Iyer', attended: 1, ok: false },
  ],
  feedback: { responses: 0, overall: null, trainer: null, comments: [] },
  costs: [{ label: 'Trainer fee', amount: 5000 }],
};
const ok = <T,>(v: T) => () => Promise.resolve(v);
export const liveSessions = (over: Partial<LiveSessions> = {}): LiveSessions => ({
  view: 'list',
  state: 'ready',
  isLd: true,
  sessions: [{ id: 'ss1', course: 'Forklift safety', type: 'classroom', start: '2026-10-01', venue: 'Hosur training room', trainer: 'Divya Rao', seats: 2, seated: 2, waiting: 1, status: 'scheduled' }],
  page: SESSION_LIVE_PAGE,
  courses: [{ id: 'c9', title: 'Forklift safety', type: 'classroom' }, { id: 'c10', title: 'Excel for planners', type: 'virtual' }],
  people: [{ id: 'u9', name: 'Divya Rao' }, { id: 'u1', name: 'Rohit Bhat' }],
  today: LRN_TODAY,
  onOpen: () => {},
  onSchedule: ok({ id: 'ss2' }),
  onShowCode: () => {},
  onMarks: ok({ marked: 1 }),
  onWithdraw: ok({ promoted: 'u3' }),
  onClose: ok({ completed: 1, noShow: 1 }),
  ...over,
});
export const liveTrainerCode = (over: Partial<LiveTrainerCode> = {}): LiveTrainerCode => ({
  state: 'ready',
  page: SESSION_LIVE_PAGE,
  slotId: 's1',
  onSlot: () => {},
  code: { code: '482913', secondsLeft: 21 },
  onRefresh: () => {},
  onMarks: ok({ marked: 2 }),
  ...over,
});
export const liveMySessions = (over: Partial<LiveMySessions> = {}): LiveMySessions => ({
  today: '2026-10-01',
  sessions: [
    { id: 'ss1', courseId: 'c9', course: 'Forklift safety', type: 'classroom', trainer: 'Divya Rao', slots: SLOTS, venue: 'Hosur training room', link: null, status: 'scheduled', seatsLeft: 0, mySeat: 'seated', canRate: false },
    { id: 'ss2', courseId: 'c9', course: 'Forklift safety', type: 'classroom', trainer: 'Divya Rao', slots: [{ id: 's1', date: '2026-11-05', start: '09:30', end: '13:00' }], venue: 'Hosur training room', link: null, status: 'scheduled', seatsLeft: 12, mySeat: null, canRate: false },
  ],
  onBook: ok({ status: 'seated', position: null }),
  onCancel: ok({ cancelled: true }),
  onCheckIn: ok({ checkedIn: true }),
  onRate: () => {},
  ...over,
});
export const liveFeedback = (over: Partial<LiveFeedback> = {}): LiveFeedback => ({
  mode: 'reaction',
  state: 'ready',
  session: { id: 'ss1', course: 'Forklift safety', trainer: 'Divya Rao', when: '1 Oct 2026 · Hosur training room' },
  checks: [{ sessionId: 'ss1', userId: 'u1', person: 'Rohit Bhat', course: 'Forklift safety', closedOn: '2026-08-01' }],
  afterDays: 60,
  onReact: ok({ rated: true }),
  onCheck: ok({ checked: true }),
  onDone: () => {},
  ...over,
});
