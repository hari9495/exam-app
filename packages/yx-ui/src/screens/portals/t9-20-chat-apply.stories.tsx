import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChatApplyScreen } from './t9-candidate';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-20 · WhatsApp and chatbot apply', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };
const base = { tenant: TENANT, accent: KAVERI_ACCENT, today: TODAY };

export const Consent: S = { name: 'Channel consent', globals: phone, render: () => <ChatApplyScreen {...base} stage="consent" /> };
export const Questions: S = { name: 'Screening questions', globals: phone, render: () => <ChatApplyScreen {...base} stage="questions" /> };
export const Knockout: S = { name: 'Knockout answer · recommendation only', globals: phone, render: () => <ChatApplyScreen {...base} stage="knockout" /> };
export const Done: S = { name: 'Applied (same application as web)', globals: phone, render: () => <ChatApplyScreen {...base} stage="done" /> };
export const OptedOut: S = { name: 'Opted out (STOP)', globals: phone, render: () => <ChatApplyScreen {...base} stage="opted-out" /> };
export const WebChat: S = { name: 'Careers-site chatbot', render: () => <ChatApplyScreen {...base} stage="questions" channel="web" /> };
