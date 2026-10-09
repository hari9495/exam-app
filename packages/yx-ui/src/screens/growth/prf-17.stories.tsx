import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewWorkspaceScreen } from './perf-reviews';
import { BIASED_SUMMARY, REVIEW_MGR } from './perf-data-3';

const meta: Meta = { title: 'Screens/Performance/PRF-17 · Review assistant and bias check', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const DRAFT =
  'Divya automated 310 of the planned 400 regression cases and brought the flaky rate from 12% to 6%. Defect leakage fell from 8% to 3.5%. Mentoring is behind plan: 5 of 12 sessions held.';

export const HelpMeDraft: S = { name: 'Help me draft', render: () => <ReviewWorkspaceScreen persona="mgr" review={REVIEW_MGR} assistant={{ enabled: true }} /> };
export const DraftShown: S = { name: 'Draft suggested', render: () => <ReviewWorkspaceScreen persona="mgr" review={REVIEW_MGR} assistant={{ enabled: true, draft: DRAFT }} /> };
export const BiasFlags: S = { name: 'Bias flags with Accept or Ignore', render: () => <ReviewWorkspaceScreen persona="mgr" review={{ ...REVIEW_MGR, summary: BIASED_SUMMARY }} assistant={{ enabled: true, showFlags: true }} /> };
export const NoFlags: S = { name: 'Nothing to flag', render: () => <ReviewWorkspaceScreen persona="mgr" review={{ ...REVIEW_MGR, summary: 'Automated 310 of 400 cases, cutting line stops for testing to zero in August.' }} assistant={{ enabled: true, showFlags: true }} /> };
export const AssistantOff: S = { name: 'AI review summaries off for the company', render: () => <ReviewWorkspaceScreen persona="mgr" review={REVIEW_MGR} assistant={{ enabled: false }} /> };
