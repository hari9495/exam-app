import type { Meta, StoryObj } from '@storybook/react-vite';
import { CandidateLinkScreen } from '../candidate-link';

const meta: Meta<typeof CandidateLinkScreen> = { title: 'Screens/Proctoring/Extra · Invitation link and session ended', component: CandidateLinkScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof CandidateLinkScreen>;

export const Checking: S = { name: 'Checking the invitation', args: { live: { state: 'checking' } } };
export const Failed: S = { name: 'Cannot open: link used or expired (no retry)', args: { live: { state: 'failed', message: 'This invitation link has already been used. Ask the company to send a new one.' } } };
export const FailedRetry: S = { name: 'Cannot open: connection lost (retry)', args: { live: { state: 'failed', message: 'We could not reach YukthiX. Check your connection.', onRetry: () => undefined } } };
export const Ended: S = { name: 'Session ended', args: { live: { state: 'ended' } } };
export const EndedPhone: S = { name: 'Session ended · phone', args: { live: { state: 'ended' } }, globals: { viewport: { value: 'mobile2', isRotated: false } } };
