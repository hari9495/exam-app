import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewAcknowledgeScreen } from './perf-reviews';
import { RELEASED } from './perf-data-3';

const meta: Meta = { title: 'Screens/Performance/PRF-06 · Review acknowledgement', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Default: S = { name: 'Acknowledge', render: () => <ReviewAcknowledgeScreen review={RELEASED} /> };
export const Disagree: S = { name: 'With disagreement flag', render: () => <ReviewAcknowledgeScreen review={RELEASED} defaultDisagree /> };
export const Done: S = { name: 'Acknowledged', render: () => <ReviewAcknowledgeScreen review={RELEASED} acknowledged /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <ReviewAcknowledgeScreen device="phone" review={RELEASED} /> };
export const PhoneDisagree: S = { name: 'Phone · disagreement', globals: PHONE, render: () => <ReviewAcknowledgeScreen device="phone" review={RELEASED} defaultDisagree /> };
