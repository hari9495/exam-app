import type { Meta, StoryObj } from '@storybook/react-vite';
import { ShiftSwapSheet } from './requests';

const meta: Meta<typeof ShiftSwapSheet> = { title: 'Screens/Time/TIM-08 · Shift change or swap', component: ShiftSwapSheet, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ShiftSwapSheet>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Request: S = { name: 'Swap request' };
export const RestBlocked: S = { name: 'Blocked · rest rule', args: { blocked: 'rest' } };
export const NightBlocked: S = { name: 'Blocked · no night-work consent', args: { blocked: 'night' } };
export const Consent: S = { name: 'Colleague consent card', args: { view: 'consent' } };
export const Accepted: S = { name: 'Consent given', args: { view: 'accepted' } };
export const Phone: S = { name: 'Phone · request', args: { surface: 'phone' }, ...phone };
export const PhoneConsent: S = { name: 'Phone · consent card', args: { surface: 'phone', view: 'consent' }, ...phone };
