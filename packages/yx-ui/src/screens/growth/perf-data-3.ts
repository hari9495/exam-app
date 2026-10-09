// Fictional sample data for review screens: cycle, review workspace, acknowledgement, nominations, dispute.
import { d, MY_STAGES } from './perf-data';
import type { DisputeCase, Nomination, ReleasedReview, ReviewData } from './perf-reviews';

export const FUNNEL = [
  { stage: 'Eligible', count: 212, names: ['Divya Raghunathan', 'Rohit Bhat', 'Meera Iyer', 'Imran Qureshi', 'Arjun Kulkarni', 'Sana Nizami'] },
  { stage: 'Self review done', count: 148, names: ['Rohit Bhat', 'Arjun Kulkarni', 'Prakash Menon', 'Thomas George'] },
  { stage: '360° feedback done', count: 96, names: ['Rohit Bhat', 'Prakash Menon'] },
  { stage: 'Manager review done', count: 41, names: ['Prakash Menon', 'Kavya Reddy', 'Vikram Singh'] },
  { stage: 'Calibrated', count: 0, names: [] },
  { stage: 'Released', count: 0, names: [] },
  { stage: 'Acknowledged', count: 0, names: [] },
];

export const OVERDUE = [
  { manager: 'Joseph Mathew', count: 9, stage: 'Self reviews in his team' },
  { manager: 'Manoj Patil', count: 7, stage: 'Self reviews in his team' },
  { manager: 'Karthik Subramanian', count: 1, stage: 'Self review: Meera Iyer' },
];

const MGR_STAGES = MY_STAGES.map((s) => (s.id === 's1' || s.id === 's2' ? { ...s, state: 'done' as const } : s.id === 's3' ? { ...s, state: 'current' as const } : s));

export const REVIEW: ReviewData = {
  employee: 'Divya Raghunathan',
  role: 'Senior QA Engineer',
  cycle: 'Half-yearly review H1 FY 2026-27',
  manager: 'Karthik Subramanian',
  stages: MY_STAGES,
  goals: [
    { id: 'p1', title: 'Automate regression tests for the packaging-line software', weight: 50, progress: 71, self: 4, selfComment: '310 of 400 cases; flaky rate 6%.', manager: null, managerComment: '' },
    { id: 'p2', title: 'Cut defect leakage to production', weight: 30, progress: 75, self: 4, selfComment: 'Leakage down from 8% to 3.5%.', manager: null, managerComment: '' },
    { id: 'p3', title: 'Mentor two new QA engineers', weight: 20, progress: 42, self: 2, selfComment: '5 of 12 sessions; plant audits took my Thursdays.', manager: null, managerComment: '' },
  ],
  competencies: [
    { id: 'k3', name: 'Test automation', required: 4, self: 4, manager: null },
    { id: 'k2', name: 'Ownership', required: 3, self: 4, manager: null },
    { id: 'k4', name: 'Coaching others', required: 3, self: null, manager: null },
  ],
  sections: [
    { id: 'goals', title: 'Goals', weight: 60, score: null },
    { id: 'comp', title: 'Competencies', weight: 30, score: null },
    { id: 'values', title: 'Values', weight: 10, score: null },
  ],
  peer: [
    { relationship: 'Peer', anonymous: true, text: 'Always explains why a test failed, not just that it failed.' },
    { relationship: 'Peer', anonymous: true, text: 'Could share test plans with the plant earlier.' },
    { relationship: 'Peer', anonymous: true, text: 'The label-printer mock saved us line time every week.' },
    { relationship: 'Direct report', anonymous: true, text: 'Very patient in pairing sessions.' },
    { relationship: 'Direct report', anonymous: true, text: 'Sessions got cancelled a few times.' },
    { relationship: 'Other', anonymous: false, author: 'Manoj Patil', text: 'Reliable partner for the plant team.' },
  ],
  kudos: [
    { value: 'Customer first', count: 3, latest: 'Stayed back to re-run seal-strength tests' },
    { value: 'Ownership', count: 1, latest: 'Built the label-printer mock' },
  ],
  summary: '',
};

export const REVIEW_MGR: ReviewData = {
  ...REVIEW,
  stages: MGR_STAGES,
  goals: REVIEW.goals.map((g) => ({ ...g, manager: g.id === 'p3' ? null : 4 })),
  competencies: REVIEW.competencies.map((c) => ({ ...c, self: c.self ?? 3 })),
  sections: [...REVIEW.sections.slice(0, 2), { id: 'values', title: 'Values', weight: 10, score: 4 }],
};

export const REVIEW_NO_VALUES: ReviewData = { ...REVIEW, sections: [...REVIEW.sections.slice(0, 2), { id: 'values', title: 'Values', weight: 10, score: null, empty: true }] };

export const BIASED_SUMMARY =
  'Divya is a good job person overall but can be abrasive in plant meetings and has an attitude problem when priorities change. The mentoring goal was missed, test plans were late twice and the vendor sign-off was delayed.';

export const RELEASED: ReleasedReview = {
  employee: 'Divya Raghunathan',
  cycle: 'Quarterly review Q1 FY 2026-27 (Apr–Jun)',
  manager: 'Karthik Subramanian',
  score: 3.72,
  released: d(25),
  managerSummary: 'Strong half: regression automation and leakage both well ahead of where we started. Mentoring fell behind; we’ve fixed a Thursday slot for H2.',
  sections: [
    { title: 'Goals (60%)', score: 3.8 },
    { title: 'Competencies (30%)', score: 3.67 },
    { title: 'Values (10%)', score: 3.5 },
  ],
};

export const NOMINATIONS: Nomination[] = [
  { id: 't2', name: 'Rohit Bhat', relationship: 'Peer', status: 'Proposed' },
  { id: 't3', name: 'Meera Iyer', relationship: 'Peer', status: 'Proposed' },
  { id: 'x2', name: 'Manoj Patil', relationship: 'Other', status: 'Proposed' },
  { id: 't4', name: 'Imran Qureshi', relationship: 'Direct report', status: 'Proposed' },
];

export const DISPUTE: DisputeCase = {
  id: 'PRF-D-0412',
  employee: 'Vikram Singh',
  cycle: 'Annual review FY 2025-26',
  raised: d(22, 7),
  status: 'Escalated',
  legalHold: true,
  grounds: 'My goal 2 was rated 2 although the delay was caused by the supplier strike, which my manager accepted in writing on 19 Feb. Calibration lowered my overall from 3 to 2.6 without a reason shared with me.',
  sought: 'A fresh review of the rating by someone independent',
  steps: [
    { id: 's1', label: 'Disagreement raised', status: 'done', approver: 'Vikram Singh', at: d(14, 7) },
    { id: 's2', label: 'HR reply', status: 'done', approver: 'Lakshmi Venkatesan', at: d(21, 7), comment: 'Calibration reason shared.' },
    { id: 's3', label: 'Escalated', status: 'done', approver: 'Vikram Singh', at: d(22, 7) },
    { id: 's4', label: 'Independent review', status: 'current', approver: 'Anand Rao, Head of People' },
    { id: 's5', label: 'Decision', status: 'pending' },
  ],
  evidence: [
    { id: 'e1', kind: 'Review version', label: 'Self review v2 (submitted)', at: d(3, 3), hash: '9f2c…b41e' },
    { id: 'e2', kind: 'Review version', label: 'Manager review v1 (submitted)', at: d(17, 3), hash: 'a7d0…22c9' },
    { id: 'e3', kind: 'Calibration change', label: 'Overall 3.0 → 2.6, reason recorded', at: d(2, 4), hash: '51be…90fa' },
    { id: 'e4', kind: '1:1 shared note', label: 'Supplier strike accepted as cause, 19 Feb', at: d(19, 1), hash: 'c3e8…7a10' },
    { id: 'e5', kind: 'Audit log', label: 'All access to this review (38 entries)', at: d(22, 7), hash: '0d4f…e6b2' },
  ],
  activity: [
    { id: 'a1', actor: { name: 'Vikram Singh' }, action: 'escalated the dispute', at: d(22, 7) },
    { id: 'a2', actor: { name: 'Lakshmi Venkatesan' }, action: 'placed a legal hold', at: d(23, 7) },
    { id: 'a3', actor: { name: 'Lakshmi Venkatesan' }, action: 'assigned independent reviewer Anand Rao', at: d(24, 7) },
  ],
};
