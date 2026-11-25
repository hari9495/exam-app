import type { LiveCourse, LiveCourseBuilder, LiveMyLearning, LiveNominate, LivePlayer } from './learn-courses-live';

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
