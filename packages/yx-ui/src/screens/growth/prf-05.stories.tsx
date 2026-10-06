import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewWorkspaceScreen } from './perf-reviews';
import { REVIEW, REVIEW_MGR, REVIEW_NO_VALUES } from './perf-data-3';

const meta: Meta = { title: 'Screens/Performance/PRF-05 · Review workspace', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const SelfReview: S = { name: 'Employee · self review', render: () => <ReviewWorkspaceScreen persona="emp" review={REVIEW} /> };
export const ManagerReview: S = { name: 'Manager · manager review with advisory peer panel', render: () => <ReviewWorkspaceScreen persona="mgr" review={REVIEW_MGR} /> };
export const SectionExcluded: S = { name: 'Section without goals excluded', render: () => <ReviewWorkspaceScreen persona="emp" review={REVIEW_NO_VALUES} /> };
export const Submitted: S = { name: 'Submitted (locked)', render: () => <ReviewWorkspaceScreen persona="emp" review={REVIEW} submitted /> };
