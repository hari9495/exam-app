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
