import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewAcknowledgeScreen } from './perf-reviews';
import { RELEASED } from './perf-data-3';
import { ACKNOWLEDGED, RELEASED as LIVE_RELEASED } from './perf-live-samples';

const meta: Meta = { title: 'Screens/Performance/PRF-06 · Review acknowledgement', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Default: S = { name: 'Acknowledge', render: () => <ReviewAcknowledgeScreen review={RELEASED} /> };
export const Disagree: S = { name: 'With disagreement flag', render: () => <ReviewAcknowledgeScreen review={RELEASED} defaultDisagree /> };
export const Done: S = { name: 'Acknowledged', render: () => <ReviewAcknowledgeScreen review={RELEASED} acknowledged /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <ReviewAcknowledgeScreen device="phone" review={RELEASED} /> };
export const PhoneDisagree: S = { name: 'Phone · disagreement', globals: PHONE, render: () => <ReviewAcknowledgeScreen device="phone" review={RELEASED} defaultDisagree /> };
export const Live: S = { name: 'Released review with section scores', render: () => <ReviewAcknowledgeScreen live={{ review: LIVE_RELEASED, onAcknowledge: async () => ({}), onDisagree: async () => ({}) }} /> };
export const LiveDisagree: S = { name: 'Disagreement too short (at least 20 characters)', render: () => <ReviewAcknowledgeScreen defaultDisagree live={{ review: LIVE_RELEASED, onAcknowledge: async () => ({}), onDisagree: async () => ({}) }} /> };
export const AnsweredByHr: S = { name: 'Acknowledged · HR answered the disagreement', render: () => <ReviewAcknowledgeScreen live={{ review: ACKNOWLEDGED, onAcknowledge: async () => ({}), onDisagree: async () => ({}) }} /> };
