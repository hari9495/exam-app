import type { Meta, StoryObj } from '@storybook/react-vite';
import { MobileCheckInSheet } from './field';

const phone = { viewport: { value: 'mobile2', isRotated: false } };
const meta: Meta<typeof MobileCheckInSheet> = { title: 'Screens/Time/TIM-12 · Mobile check-in sheet', component: MobileCheckInSheet, parameters: { layout: 'fullscreen' }, globals: phone };
export default meta;
type S = StoryObj<typeof MobileCheckInSheet>;

export const Inside: S = { name: 'Inside office area · ready' };
export const Outside: S = { name: 'Outside · blocked with reason', args: { scenario: 'outside' } };
export const Coarse: S = { name: 'Accuracy too coarse · retry', args: { scenario: 'coarse' } };
export const Early: S = { name: 'Shift not started', args: { scenario: 'early' } };
export const Offline: S = { name: 'Offline · before check-in', args: { scenario: 'offline' } };
export const OfflineSaved: S = { name: 'Offline · saved, waiting to sync', args: { scenario: 'offline', saved: true } };
export const Field: S = { name: 'Field staff · recorded, not restricted', args: { scenario: 'field' } };
export const CheckedIn: S = { name: 'Checked in · check out', args: { scenario: 'checked_in' } };
export const Device: S = { name: 'Device not bound', args: { scenario: 'device' } };
export const Selfie: S = { name: 'Selfie check-in not on yet', args: { scenario: 'selfie' } };
