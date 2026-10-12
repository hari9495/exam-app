import type { Meta, StoryObj } from '@storybook/react-vite';
import { CycleScreen, ReviewCyclesScreen, ReviewScreen, ReviewsScreen, type CycleScreenProps } from './reviews';
import type { ReviewCycle, ReviewDetail } from './types';

// Review cycles and reviews, wired (batch PM4; PRF-04 / 05 / 06). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Reviews', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
const cycle: ReviewCycle = { id: 'c1', name: 'FY 2025-26 annual review', kind: 'annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', templateId: 't1', scaleId: 's1', population: null, stages: [{ key: 'self', dueOn: '2026-10-20' }, { key: 'manager', dueOn: '2026-10-31' }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false }, status: 'draft', launchedAt: null, version: 1 };
const templates = [{ id: 't1', name: 'Annual review', kind: 'annual' as const, templateVersion: 1 }];
const cycleProps: CycleScreenProps = {
  state: 'ready',
  cycle,
  templates,
  departments: [{ value: 'd1', label: 'Sales' }],
  preflight: { problems: [{ text: 'Ravi Kumar has no manager.', fix: '/yx/people/employees/e9' }], reviewed: 42, excluded: 3, protectedLeave: 1, leavers: 2 },
  funnel: [],
  eligibility: [],
  onBack: noop,
  onSave: ok,
  onCheck: ok,
  onLaunch: ok,
  onOverride: ok,
};
const levels = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: ['Needs improvement', 'Partly meets', 'Meets', 'Exceeds', 'Outstanding'][v - 1] }));
const review: ReviewDetail = {
  id: 'r1',
  cycle: { id: 'c1', name: 'FY 2025-26 annual review', periodFrom: '2025-04-01', periodTo: '2026-03-31', stages: cycle.stages },
  employee: 'Arjun Rao',
  employeeId: 'e1',
  manager: 'Priya Nair',
  role: 'employee',
  status: 'open',
  next: { stage: 'self', label: 'Self review', owner: 'Arjun Rao', dueOn: '2026-10-20' },
  template: {
    name: 'Annual review',
    scoring: 'weighted',
    sections: [
      { id: 'g', kind: 'goals', title: 'Goals', weight: 60, rated: true, whoAnswers: ['self', 'manager'], questions: [{ id: 'g', text: 'Goals', answer: 'both', required: false, maxChars: 2000, wholeSection: true }] },
      { id: 'q', kind: 'questions', title: 'Looking ahead', weight: 0, rated: false, whoAnswers: ['self', 'manager'], questions: [{ id: 'q1', text: 'What went well in this period?', answer: 'text', required: true, maxChars: 2000, wholeSection: false }] },
    ],
    levels,
  },
  goals: [{ id: 'g1', title: 'Close three new accounts', progress: 66.67, weight: 60, status: 'active' }],
  self: null,
  selfSubmitted: false,
  managerEntry: null,
  finalScore: null,
  band: null,
  excludedSections: [],
  trail: [{ stage: 'self', event: 'opened', reason: null, at: '2026-10-12T09:00:00.000Z' }],
  can: { self: true, manager: false },
  version: 1,
};

export const Cycles: S = { render: () => <ReviewCyclesScreen state="ready" cycles={[cycle, { ...cycle, id: 'c2', name: 'H1 2026-27', status: 'launched' }]} templates={templates} departments={[]} onCreate={ok} onOpen={noop} /> };
export const CyclePreflight: S = { render: () => <CycleScreen {...cycleProps} /> };
export const CycleRunning: S = { render: () => <CycleScreen {...cycleProps} cycle={{ ...cycle, status: 'launched' }} funnel={[{ stage: 'self', label: 'Self review', count: 12 }, { stage: 'manager', label: 'Manager review', count: 20 }]} eligibility={[{ id: 'x1', employeeId: 'e1', name: 'Arjun Rao', rule: 'included', eligibleMonths: 9, proration: 0.75, reviewed: true, overrideReason: null }, { id: 'x2', employeeId: 'e2', name: 'Sita Iyer', rule: 'excluded_cutoff', eligibleMonths: 2, proration: 0.1667, reviewed: false, overrideReason: null }]} /> };
export const MyReviews: S = { render: () => <ReviewsScreen state="ready" view="mine" onView={noop} hasTeam canScope={false} reviews={[{ id: 'r1', cycle: 'FY 2025-26 annual review', cycleId: 'c1', employee: 'Arjun Rao', employeeId: 'e1', manager: 'Priya Nair', status: 'open', next: review.next, finalScore: null, band: null }]} onOpen={noop} /> };
export const SelfReview: S = { render: () => <ReviewScreen state="ready" review={review} onBack={noop} onSave={ok} /> };
export const ManagerReview: S = { render: () => <ReviewScreen state="ready" review={{ ...review, role: 'manager', can: { self: false, manager: true }, selfSubmitted: true, next: { stage: 'manager', label: 'Manager review', owner: 'Priya Nair', dueOn: '2026-10-31' } }} onBack={noop} onSave={ok} /> };
export const SkipLevel: S = { render: () => <ReviewScreen state="ready" review={{ ...review, role: 'viewer', can: { self: false, manager: false, skip: true }, finalScore: 4, band: 'Exceeds', next: { stage: 'skip', label: 'Skip-level review', owner: 'Skip-level manager', dueOn: '2026-11-10' } }} onBack={noop} onSave={ok} onSkip={ok} /> };
export const Released: S = { render: () => <ReviewScreen state="ready" review={{ ...review, status: 'released', finalScore: 3.8, band: 'Meets', can: { self: false, manager: false, acknowledge: true, disagree: true }, released: { at: '2026-11-20T09:00:00.000Z', acknowledgedAt: null, acknowledgeComment: null, disagreeBy: '2026-12-05' }, disagreements: [] }} onBack={noop} onSave={ok} onAcknowledge={ok} onDisagree={ok} /> };
export const CycleReleaseAndDisagreements: S = { render: () => <CycleScreen {...cycleProps} cycle={{ ...cycle, status: 'released' }} funnel={[{ stage: 'release', label: 'Waiting for release', count: 8 }]} disagreements={[{ id: 'd1', reviewId: 'r1', employee: 'Arjun Rao', text: 'The Madurai accounts were mine.', status: 'open', hrNote: null, at: '2026-11-22T09:00:00.000Z' }]} onRelease={ok} onDecide={ok} /> };
export const TeamHandovers: S = { render: () => <ReviewsScreen state="ready" view="team" onView={noop} hasTeam canScope={false} reviews={[]} onOpen={noop} handovers={[{ id: 'h1', employee: 'Meena Iyer', from: 'Priya Nair', to: 'Arun Kumar', direction: 'to_me', artefactType: 'review', artefactId: 'r9', effectiveOn: '2026-11-01', decisionNeeded: false }, { id: 'h2', employee: 'Meena Iyer', from: 'Priya Nair', to: 'Arun Kumar', direction: 'to_me', artefactType: 'goal_parent', artefactId: 'g9', effectiveOn: '2026-11-01', decisionNeeded: true }]} /> };
