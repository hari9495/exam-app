import type { LiveFeedback } from './learn-feedback-live';
import type { LiveSessionPage, LiveSessionPageData, LiveSessions, LiveTrainerQr } from './learn-sessions-live';

// Sessions (LRN-04, 05) and LRN-12 sample live data (stories and tests).
const ok = <T,>(v: T) => () => Promise.resolve(v);
export const liveFeedback = (over: Partial<LiveFeedback> = {}): LiveFeedback => ({
  mode: 'reaction',
  state: 'ready',
  session: { id: 'ss1', course: 'Forklift refresher', trainer: 'Divya Rao', when: 'Hosur plant, training room 2' },
  checks: [{ enrolmentId: 'e1', sessionId: 'ss1', person: 'Imran Khan', course: 'Forklift refresher', trainer: 'Divya Rao', completedOn: '2026-08-01' }],
  afterDays: 60,
  onReact: ok({ rated: true }),
  onCheck: ok({ checked: true }),
  onDone: () => {},
  ...over,
});

const ROW = { id: 'ss1', course: 'Forklift refresher', start: '2026-10-01T04:00:00.000Z', mode: 'Classroom' as const, venue: 'Hosur plant, training room 2', trainer: 'Divya Rao', external: false, seats: 2, enrolled: 1, waitlist: 1, status: 'Scheduled' as const, cost: 12000 };
export const SESSION_PAGE_LIVE: LiveSessionPageData = {
  session: { ...ROW, slots: [{ id: 'sl1', label: '1 Oct 2026', startsAt: '2026-10-01T04:00:00.000Z', endsAt: '2026-10-01T06:00:00.000Z', closed: false }], version: 1, attendancePct: 75, mandatory: false, ld: true, confirmed: false },
  enrolled: [{ enrolmentId: 'e1', employeeId: 'p1', name: 'Imran Khan', source: 'nominated' }],
  waitlist: [{ enrolmentId: 'e2', employeeId: 'p2', name: 'Arjun Nair' }],
  attendance: [{ enrolmentId: 'e1', name: 'Imran Khan', marks: ['Present'], method: 'QR' }],
  results: [],
  costLines: [{ label: 'Trainer fee', amount: 12000 }],
  feedback: { responses: 0, overall: null, trainer: null, comments: [] },
};
const wait = () => Promise.resolve();
export const liveSessionsList = (over: Partial<LiveSessions> = {}): LiveSessions => ({
  state: 'ready', onRetry: () => {}, sessions: [ROW], ld: true, trainers: [{ id: 't1', name: 'Divya Rao', org: 'Employee', external: false, sessions: 1 }],
  courses: [{ value: 'c1', label: 'Forklift refresher' }], employees: [{ value: 'p3', label: 'Divya Rao' }], view: 'list', onView: () => {}, onOpen: () => {}, onSchedule: wait, onAddTrainer: wait, ...over,
});
export const liveSessionPage = (over: Partial<LiveSessionPage> = {}): LiveSessionPage => ({
  state: 'ready', onRetry: () => {}, data: SESSION_PAGE_LIVE, trainers: [{ value: 't1', label: 'Divya Rao' }], people: [{ value: 'p3', label: 'Meena Iyer' }],
  onReschedule: wait, onCancel: wait, onWithdraw: wait, onNominate: wait, onMark: wait, onConfirm: wait, onShowQr: () => {}, ...over,
});
export const liveTrainerQr = (over: Partial<LiveTrainerQr> = {}): LiveTrainerQr => ({
  session: 'Forklift refresher', slot: '1 Oct 2026', qrImage: null, code: '482913', secondsLeft: 21, expected: [{ enrolmentId: 'e1', name: 'Imran Khan' }], present: [], closed: false, onCloseCheckin: wait, onSave: wait, onBack: () => {}, ...over,
} as LiveTrainerQr);
