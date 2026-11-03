// Sample live data for the PRF-01 … 06 stories of states only the real record has (dialogs, the manager's decision,
// who is reviewed, disagreements, the skip-level). Shapes as the API sends them; names from the Kaveri Foods demo.
import type { GoalDetail, ReviewCycle, ReviewDetail } from '../performance/live/types';
import type { LiveControlRoom, LiveCycleSetup, LiveReviewWorkspace } from './perf-reviews-live';
import type { LiveGoalMap, LiveMyGoals } from './perf-goals-live';
import type { GoalItem } from './perf-live-data';

const ok = async () => ({});
const noop = () => undefined;
export const PERIODS = [{ id: 'p1', name: 'H2 FY 2026-27', fromOn: '2026-10-01', toOn: '2027-03-31', status: 'open' as const }];

const goal = (o: Partial<GoalItem>): GoalItem => ({ id: 'g1', periodId: 'p1', ownerType: 'person', ownerEmployeeId: 'e1', ownerDepartmentId: null, owner: 'Divya Raghunathan', parentGoalId: 'c1', kind: 'okr', title: 'Automate regression testing on line 3', weight: 50, status: 'active', progress: 62, version: 2, keyResults: [{ id: 'k1', title: 'Regression cases automated', unit: 'cases', direction: 'up', start: 0, target: 400, current: 248, weight: 1, progress: 62 }], confidence: 'on_track', lastCheckIn: '2026-10-28', ...o });
export const COMPANY: GoalItem[] = [goal({ id: 'c1', ownerType: 'company', ownerEmployeeId: null, owner: 'Company', parentGoalId: null, title: 'Cut customer complaints by 30%', weight: 0, progress: 48, confidence: 'at_risk' })];
export const MINE: GoalItem[] = [goal({}), goal({ id: 'g2', title: 'Mentor two new QA engineers', weight: 30, kind: 'kpi', keyResults: [], progress: 40, confidence: null, lastCheckIn: null, status: 'draft' }), goal({ id: 'g3', title: 'Bring the flaky-test rate below 5%', weight: 20, status: 'draft', keyResults: [{ id: 'k3', title: 'Flaky rate', unit: '%', direction: 'down', start: 12, target: 5, current: 6, weight: 1, progress: 86 }], progress: 86 })];

export const GOAL_DETAIL: GoalDetail = { ...MINE[1], description: null, parent: { id: 'c1', title: 'Cut customer complaints by 30%', progress: 48 }, children: [], checkins: [], pendingChange: null, decisionNote: null, can: { edit: true, checkIn: false, drop: true, cascade: false } };

export const MY_GOALS: LiveMyGoals = {
  state: 'ready',
  onRetry: noop,
  persona: 'emp',
  ownerName: 'Divya Raghunathan',
  periods: PERIODS,
  periodId: 'p1',
  onPeriod: noop,
  goals: MINE,
  totalWeight: 100,
  canDecide: false,
  companyGoals: COMPANY,
  alignOptions: [{ id: 'c1', title: 'Cut customer complaints by 30%', owner: 'Company' }],
  openGoalId: null,
  onOpenGoal: noop,
  goal: null,
  team: [],
  onCreate: ok,
  onSave: ok,
  onSubmit: ok,
  onCheckIn: ok,
  onDrop: ok,
  onCascade: ok,
  onDecide: ok,
};
export const MANAGER_GOALS: LiveMyGoals = { ...MY_GOALS, persona: 'mgr', ownerName: 'Ananya Das', goals: MINE.map((g) => ({ ...g, owner: 'Ananya Das', status: 'submitted' as const })), canDecide: true };

export const MAP: LiveGoalMap = {
  state: 'ready',
  onRetry: noop,
  persona: 'hr',
  periods: PERIODS,
  periodId: 'p1',
  onPeriod: noop,
  departments: [{ value: 'd1', label: 'Quality' }, { value: 'd2', label: 'Sales' }],
  map: { goals: [...COMPANY, ...MINE.map((g) => ({ ...g, status: 'active' as const, departmentId: 'd1' })), goal({ id: 'g9', owner: 'Ravi Kumar', title: 'Open 12 distributors in Madurai', parentGoalId: null, departmentId: 'd2', confidence: 'off_track', progress: 20 })], unaligned: ['g9'], offTrack: ['g9'] },
  alignOptions: [{ id: 'c1', title: 'Cut customer complaints by 30%', owner: 'Company' }],
  onOpenGoal: noop,
  onCreate: ok,
  onSuggestParent: ok,
  onAddPeriod: ok,
};

export const CYCLE: ReviewCycle = { id: 'cy1', name: 'Half-yearly review H2 FY 2026-27', kind: 'half_yearly', periodFrom: '2026-10-01', periodTo: '2027-03-31', templateId: 't1', scaleId: 's1', population: null, stages: [{ key: 'self', dueOn: '2027-04-10' }, { key: 'manager', dueOn: '2027-04-20' }, { key: 'skip', dueOn: '2027-04-25' }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false }, peerFeedback: { minNominees: 3, maxNominees: 6, dueOn: '2027-04-15' }, status: 'draft', launchedAt: null, version: 1 };

export const SETUP: LiveCycleSetup = {
  state: 'ready',
  onRetry: noop,
  cycle: CYCLE,
  templates: [{ id: 't1', name: 'Half-yearly review', kind: 'half_yearly', templateVersion: 1 }],
  departments: [{ value: 'd1', label: 'Quality' }, { value: 'd2', label: 'Sales' }],
  disagreeDays: 15,
  onSave: async () => CYCLE,
  onPeer: ok,
  onCheck: async () => ({ problems: [{ text: 'Ravi Kumar has no manager.', fix: null }], reviewed: 212, excluded: 9, protectedLeave: 3, leavers: 6 }),
  onLaunch: ok,
  onDone: noop,
};

/** PRF-04 set-up with calibration: one planned session and the people who can run one. */
export const SETUP_CALIBRATION: LiveCycleSetup = {
  ...SETUP,
  cycle: { ...CYCLE, calibration: [{ name: 'Quality and lab', facilitatorUserId: 'u1', departmentIds: ['d1'] }] },
  facilitators: [{ value: 'u1', label: 'Lakshmi Rao' }, { value: 'u2', label: 'Aisha Khan' }],
};

export const CONTROL: LiveControlRoom = {
  state: 'ready',
  onRetry: noop,
  cycle: { ...CYCLE, status: 'launched', launchedAt: '2026-11-01T09:00:00.000Z' },
  funnel: [{ stage: 'self', label: 'Self review', count: 64 }, { stage: 'manager', label: 'Manager review', count: 88 }, { stage: 'skip', label: 'Skip-level review', count: 21 }, { stage: 'release', label: 'Waiting for release', count: 39 }, { stage: 'done', label: 'Done', count: 0 }],
  overdue: [{ ownerEmployeeId: 'm1', owner: 'Karthik Subramanian', stage: 'Manager review', count: 6 }, { ownerEmployeeId: 'm2', owner: 'Aisha Khan', stage: 'Skip-level review', count: 3 }],
  eligibility: [
    { id: 'x1', employeeId: 'e1', name: 'Divya Raghunathan', rule: 'included', eligibleMonths: 6, proration: 1, reviewed: true, overrideReason: null },
    { id: 'x2', employeeId: 'e2', name: 'Meena Iyer', rule: 'protected_leave', eligibleMonths: 6, proration: 1, reviewed: true, overrideReason: null },
    { id: 'x3', employeeId: 'e3', name: 'Sita Iyer', rule: 'excluded_cutoff', eligibleMonths: 1.5, proration: 0.25, reviewed: false, overrideReason: null },
  ],
  disagreements: [{ id: 'd1', reviewId: 'r1', employee: 'Arjun Rao', text: 'Goal 2 rating does not account for the vendor delay agreed in my 1:1 on 19 Aug.', status: 'open', hrNote: null, at: '2026-11-22T09:00:00.000Z' }],
  stagePeople: async () => [{ reviewId: 'r1', employee: 'Divya Raghunathan', owner: 'Karthik Subramanian', dueOn: '2027-04-20', overdue: false }],
  onOpenReview: noop,
  onRemind: async () => ({ reminded: 2 }),
  onExtend: ok,
  onRelease: async () => ({ released: 39, notReady: 173 }),
  onDecide: ok,
  onOverride: ok,
};

const SECTIONS: ReviewDetail['template']['sections'] = [
  { id: 'sg', kind: 'goals', title: 'Goals', weight: 60, rated: true, whoAnswers: ['self', 'manager'], questions: [{ id: 'sg', text: 'Goals', answer: 'both', required: false, maxChars: 2000, wholeSection: true }] },
  { id: 'sc', kind: 'competencies', title: 'Competencies', weight: 40, rated: true, whoAnswers: ['self', 'manager'], questions: [{ id: 'q1', text: 'Quality mindset', answer: 'rating', required: true, maxChars: 2000, wholeSection: false }] },
];
export const REVIEW: ReviewDetail = {
  id: 'r1',
  cycle: { id: 'cy1', name: CYCLE.name, periodFrom: CYCLE.periodFrom, periodTo: CYCLE.periodTo, stages: CYCLE.stages },
  employee: 'Divya Raghunathan',
  employeeId: 'e1',
  manager: 'Karthik Subramanian',
  role: 'viewer',
  status: 'open',
  next: { stage: 'skip', label: 'Skip-level review', owner: 'Skip-level manager', dueOn: '2027-04-25' },
  template: { name: 'Half-yearly review', scoring: 'weighted', sections: SECTIONS, levels: ['Needs improvement', 'Partly meets', 'Meets', 'Exceeds', 'Outstanding'].map((label, i) => ({ value: i + 1, label })) },
  goals: [{ id: 'g1', title: 'Automate regression testing on line 3', progress: 62, weight: 50, status: 'active' }],
  self: { status: 'submitted', answers: { sg: { rating: 4, text: 'Automation ahead of plan.' }, q1: { rating: 4, text: null } }, overallRating: null, comment: 'A strong half.', submittedAt: '2027-04-08T09:00:00.000Z', version: 2 },
  selfSubmitted: true,
  managerEntry: { status: 'submitted', answers: { sg: { rating: 4, text: '310 of 400 cases automated.' }, q1: { rating: 3, text: null } }, overallRating: null, comment: 'Divya brought the flaky rate from 12% to 6%.', submittedAt: '2027-04-18T09:00:00.000Z', version: 3 },
  finalScore: 3.6,
  band: 'Exceeds',
  excludedSections: [],
  sectionScores: [{ title: 'Goals', score: 4 }, { title: 'Competencies', score: 3 }],
  trail: [{ stage: 'self', event: 'submitted', reason: null, at: '2027-04-08T09:00:00.000Z' }, { stage: 'manager', event: 'submitted', reason: null, at: '2027-04-18T09:00:00.000Z' }],
  can: { self: false, manager: false, skip: true },
  version: 4,
};

export const WORKSPACE: LiveReviewWorkspace = { state: 'ready', onRetry: noop, review: REVIEW, peer: { advisory: true, peer: CYCLE.peerFeedback!, released: false, responses: 5, shown: [{ group: 'peer', responses: 4, ratings: {}, texts: ['Always unblocks the line quickly.'] }], heldBack: 1 }, onSave: ok, onSkip: ok, onReopen: ok, onAddOther: ok };

export const RELEASED: ReviewDetail = { ...REVIEW, role: 'employee', status: 'released', next: { stage: 'done', label: 'Released: waiting for acknowledgement', owner: 'Divya Raghunathan', dueOn: null }, released: { at: '2027-05-02T09:00:00.000Z', acknowledgedAt: null, acknowledgeComment: null, disagreeBy: '2027-05-17' }, disagreements: [], can: { self: false, manager: false, acknowledge: true, disagree: true } };
export const ACKNOWLEDGED: ReviewDetail = { ...RELEASED, status: 'acknowledged', released: { ...RELEASED.released!, acknowledgedAt: '2027-05-04T09:00:00.000Z' }, disagreements: [{ id: 'd1', text: 'Goal 2 rating does not account for the vendor delay agreed in my 1:1.', status: 'answered', hrNote: 'We checked with Karthik; the delay is now noted in your review.' }], can: { self: false, manager: false, acknowledge: false, disagree: false } };
