import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuickFeedbackScreen, type LiveQuickFeedback } from './perf-people';
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
export const Ask: S = { name: 'Ask for feedback sheet', render: () => <QuickFeedbackScreen {...base} askOpen /> };
export const LoadError: S = { name: 'Error', render: () => <QuickFeedbackScreen {...base} state="error" /> };
const sample: LiveQuickFeedback = {
  onRetry: () => {},
  defaultVisibility: 'Them and their manager',
  onPeopleSearch: () => {},
  onRecipient: () => {},
  team: [{ ...RECEIVED[0]!, id: 'tm1', to: 'Rohit Bhat' }],
  concerns: { personId: 't2', onPerson: () => {}, items: [{ ...RECEIVED[1]!, id: 'c1', canSeal: true }, { ...RECEIVED[2]!, id: 'c2', sealed: true }] },
  askAbout: [{ value: 't1', label: 'Myself' }],
  concernHref: '#',
  onGive: async () => {},
  onWithdraw: async () => {},
  onAsk: async () => {},
  onDecline: async () => {},
  onSeal: async () => {},
};
export const Team: S = { name: 'Manager · my team', render: () => <QuickFeedbackScreen {...base} given={GIVEN.map((g) => ({ ...g, canWithdraw: true }))} defaultTab="team" live={sample} /> };
export const Concerns: S = { name: 'HR · concerns and sealing', render: () => <QuickFeedbackScreen {...base} defaultTab="concerns" live={sample} /> };
export const Seal: S = { name: 'HR · seal a concern', render: () => <QuickFeedbackScreen {...base} defaultTab="concerns" live={sample} sealOpen /> };
