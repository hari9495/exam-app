import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuickFeedbackScreen } from './perf-people';
import { GIVEN, MEERA_GOALS, PEOPLE, RECEIVED, REQUESTS } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-08 · Quick feedback', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const base = { me: 'Divya Raghunathan', people: PEOPLE, goals: MEERA_GOALS, received: RECEIVED, given: GIVEN, requests: REQUESTS };

export const Received: S = { name: 'Received', render: () => <QuickFeedbackScreen {...base} /> };
export const Give: S = { name: 'Give feedback sheet', render: () => <QuickFeedbackScreen {...base} composerOpen /> };
export const Sent: S = { name: 'Sent confirmation', render: () => <QuickFeedbackScreen {...base} defaultTab="given" sent /> };
export const Requests: S = { name: 'Requests to me', render: () => <QuickFeedbackScreen {...base} defaultTab="requests" /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <QuickFeedbackScreen {...base} device="phone" /> };
export const PhoneGive: S = { name: 'Phone · give feedback', globals: PHONE, render: () => <QuickFeedbackScreen {...base} device="phone" composerOpen /> };
export const Empty: S = { render: () => <QuickFeedbackScreen {...base} received={[]} given={[]} requests={[]} /> };
