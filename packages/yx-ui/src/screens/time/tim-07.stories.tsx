import type { Meta, StoryObj } from '@storybook/react-vite';
import { AttendanceRequestSheet } from './requests';

const meta: Meta<typeof AttendanceRequestSheet> = { title: 'Screens/Time/TIM-07 · Attendance request', component: AttendanceRequestSheet, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof AttendanceRequestSheet>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Regularise: S = { name: 'Regularise · effect preview' };
export const OverLimit: S = { name: 'Regularise · over monthly limit → HR', args: { used: 4 } };
export const LateRequest: S = { name: 'Locked date · late request', args: { locked: true } };
export const Wfh: S = { name: 'WFH', args: { type: 'wfh' } };
export const OnDuty: S = { name: 'On duty with location', args: { type: 'on_duty' } };
export const Ot: S = { name: 'OT pre-approval', args: { type: 'ot' } };
export const Invalid: S = { name: 'Validation error', args: { error: true } };
export const Sent: S = { name: 'Sent', args: { submitted: true } };
export const Phone: S = { name: 'Phone', args: { surface: 'phone' }, ...phone };
export const PhoneWfh: S = { name: 'Phone · WFH', args: { surface: 'phone', type: 'wfh' }, ...phone };
