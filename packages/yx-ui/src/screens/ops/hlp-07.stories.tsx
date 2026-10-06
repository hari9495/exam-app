import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyCasesScreen } from './cases';
import { MY_CASES, SHOW_CAUSE } from './cases-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-07 · My cases', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const base = { cases: MY_CASES, showCause: SHOW_CAUSE, today: TODAY };

export const List: S = { name: 'My cases (complainant, respondent, witness)', render: () => <MyCasesScreen {...base} /> };
export const ShowCauseReply: S = { name: 'Show-cause reply', render: () => <MyCasesScreen {...base} replyOpen /> };
export const ExtensionAsked: S = { name: 'Show-cause · extension requested', render: () => <MyCasesScreen {...base} replyOpen extensionRequested /> };
export const Replied: S = { name: 'Reply sent', render: () => <MyCasesScreen {...base} replied /> };
export const Empty: S = { render: () => <MyCasesScreen {...base} cases={[]} state="empty" /> };
export const Loading: S = { render: () => <MyCasesScreen {...base} state="loading" /> };
export const Phone: S = { name: 'My cases · phone', globals: PHONE, render: () => <MyCasesScreen {...base} device="phone" /> };
export const PhoneReply: S = { name: 'Show-cause reply · phone', globals: PHONE, render: () => <MyCasesScreen {...base} device="phone" replyOpen /> };
