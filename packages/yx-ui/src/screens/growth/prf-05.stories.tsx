import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewWorkspaceScreen } from './perf-reviews';
import { REVIEW, REVIEW_MGR, REVIEW_NO_VALUES } from './perf-data-3';
import { REVIEW as LIVE_REVIEW, WORKSPACE } from './perf-live-samples';

const meta: Meta = { title: 'Screens/Performance/PRF-05 · Review workspace', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const SelfReview: S = { name: 'Employee · self review', render: () => <ReviewWorkspaceScreen persona="emp" review={REVIEW} /> };
export const ManagerReview: S = { name: 'Manager · manager review with advisory peer panel', render: () => <ReviewWorkspaceScreen persona="mgr" review={REVIEW_MGR} /> };
export const SectionExcluded: S = { name: 'Section without goals excluded', render: () => <ReviewWorkspaceScreen persona="emp" review={REVIEW_NO_VALUES} /> };
export const Submitted: S = { name: 'Submitted (locked)', render: () => <ReviewWorkspaceScreen persona="emp" review={REVIEW} submitted /> };
export const SkipLevel: S = { name: 'Skip-level · agree or send back', render: () => <ReviewWorkspaceScreen live={WORKSPACE} /> };
export const HrReopen: S = { name: 'HR · reopen a finished review', render: () => <ReviewWorkspaceScreen live={{ ...WORKSPACE, review: { ...LIVE_REVIEW, status: 'ready', next: { stage: 'release', label: 'Waiting for release', owner: 'HR', dueOn: null }, can: { self: false, manager: false, reopen: true } } }} /> };
export const FormerManager: S = { name: 'Former manager · advisory input', render: () => <ReviewWorkspaceScreen live={{ ...WORKSPACE, review: { ...LIVE_REVIEW, role: 'other', self: null, managerEntry: null, otherEntry: { status: 'draft', answers: {}, overallRating: null, comment: null, submittedAt: null, version: 1 }, finalScore: null, band: null, sectionScores: [], next: { stage: 'manager', label: 'Manager review', owner: 'Karthik Subramanian', dueOn: '2027-04-20' }, can: { self: false, manager: false, other: true } }, peer: null }} /> };
export const ManagerPotential: S = { name: 'Manager · potential for calibration', render: () => <ReviewWorkspaceScreen persona="mgr" review={{ ...REVIEW_MGR, potential: 3 }} /> };
// T2-C 2661 (answer 2846): the period's kudos by value; the person hides one until the manager submits; never scored.
const KUDOS = [
  { value: 'Customer first', items: [{ id: 'k1', message: 'Stayed back to re-run the seal-strength tests', from: 'Kiran Rao', on: '2026-08-14T10:00:00Z', badge: 'Above and beyond', hidden: false }] },
  { value: 'Own it', items: [{ id: 'k2', message: 'Built the label-printer mock', from: 'Sita Iyer', on: '2026-06-02T10:00:00Z', badge: null, hidden: true }, { id: 'k3', message: 'Fixed the night-shift report', from: 'Arun K', on: '2026-05-20T10:00:00Z', badge: null, hidden: false }] },
];
const ok = async () => ({});
export const KudosPerson: S = { name: 'Employee · kudos this period (hide one)', render: () => <ReviewWorkspaceScreen live={{ ...WORKSPACE, review: { ...LIVE_REVIEW, role: 'employee', kudos: KUDOS, can: { ...LIVE_REVIEW.can, hideKudos: true } }, onHideKudos: ok }} /> };
export const KudosReviewer: S = { name: 'Manager · kudos this period (hidden ones never shown)', render: () => <ReviewWorkspaceScreen live={{ ...WORKSPACE, review: { ...LIVE_REVIEW, role: 'manager', kudos: KUDOS.map((g) => ({ ...g, items: g.items.filter((k) => !k.hidden) })), can: { ...LIVE_REVIEW.can, hideKudos: false } } }} /> };

