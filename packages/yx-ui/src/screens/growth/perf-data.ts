// Fictional sample data for Performance screens (Kaveri Foods Pvt Ltd). Deterministic; dates relative to TODAY (29 Sep 2026).
import type { ActionItem } from '../../components/dashboard';
import type { CoachNudge, StageItem } from './growth-kit';
import type { Goal } from './growth-logic';
import type { CheckIn, CycleSummary, TeamMemberPerf } from './perf-goals';

export const d = (day: number, month = 8, year = 2026) => new Date(year, month, day);

export const MANAGER = { name: 'Karthik Subramanian', role: 'Quality Manager' };
export const HR = { name: 'Lakshmi Venkatesan', role: 'HR Business Partner' };
export const TEAM = [
  { id: 't1', name: 'Divya Raghunathan', role: 'Senior QA Engineer' },
  { id: 't2', name: 'Rohit Bhat', role: 'Quality Inspector' },
  { id: 't3', name: 'Meera Iyer', role: 'Quality Inspector' },
  { id: 't4', name: 'Imran Qureshi', role: 'QA Engineer' },
  { id: 't5', name: 'Ananya Das', role: 'Quality Inspector' },
  { id: 't6', name: 'Sneha Ghosh', role: 'Quality Analyst' },
];

export const GOALS: Goal[] = [
  {
    id: 'c1',
    title: 'Grow revenue to ₹480 crore in FY 2026-27',
    type: 'okr',
    owner: { type: 'company', name: 'Kaveri Foods' },
    weight: 50,
    period: 'FY 2026-27',
    status: 'Approved',
    confidence: 'On track',
    keyResults: [
      { id: 'c1k1', title: 'Revenue', start: 402, target: 480, actual: 441, unit: '₹ crore' },
      { id: 'c1k2', title: 'New modern-trade outlets', start: 0, target: 1200, actual: 690, unit: 'outlets' },
    ],
  },
  {
    id: 'c2',
    title: 'Be the most trusted snack brand in South India',
    type: 'okr',
    owner: { type: 'company', name: 'Kaveri Foods' },
    weight: 50,
    period: 'FY 2026-27',
    status: 'Approved',
    confidence: 'At risk',
    keyResults: [],
  },
  {
    id: 'q1',
    title: 'Zero critical quality escapes from Hosur plant',
    type: 'okr',
    owner: { type: 'team', name: 'Quality' },
    parentId: 'c2',
    weight: 60,
    period: 'FY 2026-27',
    status: 'Approved',
    confidence: 'At risk',
    keyResults: [
      { id: 'q1k1', title: 'Critical escapes per quarter', start: 6, target: 0, actual: 2, unit: 'escapes', direction: 'decrease' },
      { id: 'q1k2', title: 'Supplier audits completed', start: 0, target: 24, actual: 15, unit: 'audits' },
    ],
  },
  {
    id: 's1',
    title: 'Cut consumer complaints per million packs',
    type: 'kpi',
    owner: { type: 'team', name: 'Sales, South' },
    parentId: 'c2',
    weight: 40,
    period: 'FY 2026-27',
    status: 'Approved',
    confidence: 'Off track',
    keyResults: [{ id: 's1k1', title: 'Complaints per million packs', start: 40, target: 15, actual: 34, unit: 'per million', direction: 'decrease' }],
  },
  {
    id: 'p1',
    title: 'Automate regression tests for the packaging-line software',
    type: 'okr',
    owner: { type: 'person', name: 'Divya Raghunathan' },
    parentId: 'q1',
    weight: 50,
    period: 'H1 FY 2026-27',
    status: 'Approved',
    confidence: 'On track',
    lastCheckIn: d(18),
    keyResults: [
      { id: 'p1k1', title: 'Automated test cases', start: 120, target: 400, actual: 310, unit: 'cases' },
      { id: 'p1k2', title: 'Flaky test rate', start: 12, target: 3, actual: 6, unit: '%', direction: 'decrease' },
    ],
  },
  {
    id: 'p2',
    title: 'Cut defect leakage to production',
    type: 'okr',
    owner: { type: 'person', name: 'Divya Raghunathan' },
    parentId: 'q1',
    weight: 30,
    period: 'H1 FY 2026-27',
    status: 'Approved',
    confidence: 'On track',
    lastCheckIn: d(4),
    keyResults: [{ id: 'p2k1', title: 'Defect leakage', start: 8, target: 2, actual: 3.5, unit: '%', direction: 'decrease' }],
  },
  {
    id: 'p3',
    title: 'Mentor two new QA engineers',
    type: 'kpi',
    owner: { type: 'person', name: 'Divya Raghunathan' },
    parentId: 'q1',
    weight: 20,
    period: 'H1 FY 2026-27',
    status: 'Approved',
    confidence: 'At risk',
    lastCheckIn: d(21, 7),
    keyResults: [{ id: 'p3k1', title: 'Mentoring sessions held', start: 0, target: 12, actual: 5, unit: 'sessions' }],
  },
  {
    id: 'r1',
    title: 'Close 3 supplier corrective actions',
    type: 'okr',
    owner: { type: 'person', name: 'Rohit Bhat' },
    parentId: 'q1',
    weight: 100,
    period: 'H1 FY 2026-27',
    status: 'Approved',
    confidence: 'On track',
    keyResults: [{ id: 'r1k1', title: 'Corrective actions closed', start: 0, target: 3, actual: 2, unit: 'actions' }],
  },
];

/** Ananya (joined July) sent goals for approval; weights add to 90%. */
export const ANANYA_GOALS: Goal[] = [
  {
    id: 'a1',
    title: 'Complete incoming-material inspection certification',
    type: 'kpi',
    owner: { type: 'person', name: 'Ananya Das' },
    parentId: 'q1',
    weight: 50,
    period: 'H1 FY 2026-27',
    status: 'Pending approval',
    keyResults: [{ id: 'a1k1', title: 'Modules passed', start: 0, target: 4, actual: 1, unit: 'modules' }],
  },
  {
    id: 'a2',
    title: 'Run first-article inspections on line 3',
    type: 'okr',
    owner: { type: 'person', name: 'Ananya Das' },
    parentId: 'q1',
    weight: 40,
    period: 'H1 FY 2026-27',
    status: 'Pending approval',
    keyResults: [{ id: 'a2k1', title: 'Inspections signed off', start: 0, target: 30, actual: 0, unit: 'inspections' }],
  },
];

export const UNALIGNED: Goal[] = [
  { id: 'u1', title: 'Clean up the vendor master', type: 'kpi', owner: { type: 'person', name: 'Suresh Pillai' }, weight: 30, period: 'H1', status: 'Approved', keyResults: [] },
  { id: 'u2', title: 'Launch millet snack range in Kerala', type: 'okr', owner: { type: 'team', name: 'Sales, South' }, weight: 50, period: 'FY', status: 'Approved', keyResults: [] },
  { id: 'u3', title: 'Reduce shift handover delays', type: 'kpi', owner: { type: 'person', name: 'Manoj Patil' }, weight: 25, period: 'H1', status: 'Draft', keyResults: [] },
];

export const CHECKINS: Record<string, CheckIn[]> = {
  p1: [
    { id: 'ci1', by: 'Divya Raghunathan', at: d(18), text: '310 cases automated; flaky rate down to 6% after fixing the label-printer mock.' },
    { id: 'ci2', by: 'Karthik Subramanian', at: d(19), text: 'Good progress. Let’s pick the top 20 flaky tests in our next 1:1.' },
    { id: 'ci3', by: 'Divya Raghunathan', at: d(21, 7), text: '240 cases automated.' },
  ],
};

export const EMP_ACTIONS: ActionItem[] = [
  { id: 'a1', type: 'Review', title: 'Self review, Half-yearly H1 FY 2026-27', who: 'Divya Raghunathan', due: d(5, 9), kind: 'review' },
  { id: 'a2', type: '360°', title: 'Nominate 3–6 reviewers for your 360° feedback', who: 'Divya Raghunathan', due: d(2, 9), kind: 'review' },
  { id: 'a3', type: 'Check-in', title: 'Goal check-in: Mentor two new QA engineers (last 21 Aug)', who: 'Divya Raghunathan', due: d(30), kind: 'review' },
];

export const MGR_ACTIONS: ActionItem[] = [
  { id: 'm1', type: 'Goals', title: 'Approve goals: Ananya Das (2 goals, weights 90%)', who: 'Ananya Das', due: d(30), kind: 'review' },
  { id: 'm2', type: '360°', title: 'Approve 360° nominations: Divya Raghunathan (5 reviewers)', who: 'Divya Raghunathan', due: d(3, 9) },
  { id: 'm3', type: 'Review', title: 'Manager review: Rohit Bhat (self review done)', who: 'Rohit Bhat', due: d(19, 9), kind: 'review' },
  { id: 'm4', type: 'PIP', title: 'PIP check-in 3 of 6: Imran Qureshi', who: 'Imran Qureshi', due: d(1, 9), kind: 'review' },
];

export const HR_ACTIONS: ActionItem[] = [
  { id: 'h1', type: 'PIP', title: 'Approve PIP proposed by Joseph Mathew for Rahul Sharma', who: 'Joseph Mathew', due: d(30) },
  { id: 'h2', type: 'Hand-over', title: '7 artefacts need a decision after Priya Nair’s exit', who: 'Priya Nair', due: d(1, 9), kind: 'review' },
  { id: 'h3', type: 'Dispute', title: 'Rating disagreement raised by Vikram Singh', who: 'Vikram Singh', due: d(6, 9), kind: 'review' },
  { id: 'h4', type: 'Calibration', title: 'Schedule calibration: Operations, Hosur plant', who: 'Lakshmi Venkatesan', due: d(20, 9), kind: 'review' },
];

export const MY_STAGES: StageItem[] = [
  { id: 's1', label: 'Self review', owner: 'You', due: d(5, 9), state: 'current' },
  { id: 's2', label: '360° feedback', owner: '5 reviewers', due: d(12, 9), state: 'todo' },
  { id: 's3', label: 'Manager review', owner: 'Karthik Subramanian', due: d(19, 9), state: 'todo' },
  { id: 's4', label: 'Skip-level', owner: 'Aisha Khan', due: d(24, 9), state: 'todo' },
  { id: 's5', label: 'Calibration', owner: 'HR', due: d(4, 10), state: 'todo' },
  { id: 's6', label: 'Release', owner: 'HR', due: d(11, 10), state: 'todo' },
  { id: 's7', label: 'Acknowledge', owner: 'You', due: d(18, 10), state: 'todo' },
];

export const FEEDBACK_RECEIVED = [
  { id: 'f1', from: 'Meera Iyer', text: 'Your checklist for the line-3 changeover saved us two hours on Friday.', at: d(24), kind: 'Praise' as const },
  { id: 'f2', from: 'Karthik Subramanian', text: 'Share the test plan earlier with the plant team so they can book the line.', at: d(11), kind: 'Suggestion' as const },
];

export const TEAM_PERF: TeamMemberPerf[] = [
  { id: 't1', name: 'Divya Raghunathan', role: 'Senior QA Engineer', goalProgress: 64, reviewStage: 'Self review', lastOneOnOne: d(19), lastFeedback: d(11) },
  { id: 't2', name: 'Rohit Bhat', role: 'Quality Inspector', goalProgress: 67, reviewStage: 'Manager review', lastOneOnOne: d(8), lastFeedback: d(29, 6) },
  { id: 't3', name: 'Meera Iyer', role: 'Quality Inspector', goalProgress: 48, reviewStage: 'Self review, overdue', lastOneOnOne: d(2, 7), lastFeedback: d(1, 7) },
  { id: 't4', name: 'Imran Qureshi', role: 'QA Engineer', goalProgress: 31, reviewStage: 'On PIP · review paused', lastOneOnOne: d(22), lastFeedback: d(22) },
  { id: 't5', name: 'Ananya Das', role: 'Quality Inspector', goalProgress: null, reviewStage: 'Probation review', lastOneOnOne: d(15), lastFeedback: null },
  { id: 't6', name: 'Sneha Ghosh', role: 'Quality Analyst', goalProgress: 70, reviewStage: 'Protected leave', lastOneOnOne: d(10, 5), lastFeedback: d(3, 5) },
];

export const NUDGES: CoachNudge[] = [
  { id: 'n1', person: 'Meera Iyer', signal: 'No feedback from you in 8 weeks; 1:1 overdue by 3 weeks.', action: 'Book 1:1' },
  { id: 'n2', person: 'Rohit Bhat', signal: '14 leave days unused this year.', action: 'Suggest leave' },
  { id: 'n3', person: 'Ananya Das', signal: 'New joiner: 3 onboarding tasks still open.', action: 'View tasks' },
  { id: 'n4', person: 'Divya Raghunathan', signal: 'Goal “Mentor two new QA engineers” is at risk.', action: 'Add to 1:1 agenda' },
];

export const CYCLES: CycleSummary[] = [
  { id: 'hy', name: 'Half-yearly review H1 FY 2026-27', stage: 'Self review', eligible: 212, done: 148, overdue: 37 },
  { id: 'pb', name: 'Probation reviews, September', stage: 'Manager review', eligible: 11, done: 6, overdue: 2 },
];

export const RATING_DIST = [
  { dept: 'Engineering', counts: [2, 5, 20, 12, 3], size: 42 },
  { dept: 'Operations', counts: [4, 11, 38, 16, 3], size: 72 },
  { dept: 'Sales', counts: [1, 4, 14, 9, 2], size: 30 },
  { dept: 'Finance', counts: [0, 1, 7, 4, 1], size: 13 },
  { dept: 'People', counts: [0, 0, 2, 1, 1], size: 4 },
  { dept: 'Quality', counts: [0, 2, 9, 5, 1], size: 17 },
];
