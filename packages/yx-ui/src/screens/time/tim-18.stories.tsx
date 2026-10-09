import type { Meta, StoryObj } from '@storybook/react-vite';
import { ApplyLeaveSheet } from './leave';

const meta: Meta<typeof ApplyLeaveSheet> = { title: 'Screens/Time/TIM-18 · Apply leave', component: ApplyLeaveSheet, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ApplyLeaveSheet>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Sandwich: S = { name: 'Earned leave · sandwich counted' };
export const HalfDays: S = { name: 'Half days at both ends', args: { from: new Date(2026, 9, 5), to: new Date(2026, 9, 7), fromHalf: 'second', toHalf: 'first' } };
export const OverBalance: S = { name: 'Over balance · blocked', args: { type: 'CL', from: new Date(2026, 9, 5), to: new Date(2026, 9, 9) } };
export const ShortNotice: S = { name: 'Short notice warning', args: { from: new Date(2026, 8, 30), to: new Date(2026, 8, 30) } };
export const SickCert: S = { name: 'Sick leave · certificate required', args: { type: 'SL', from: new Date(2026, 8, 28), to: new Date(2026, 8, 30) } };
export const BlockDate: S = { name: 'Company block date', args: { blocked: true } };
// Meera Iyer is serving notice (last day 19 Oct, ON_NOTICE in time-data); she applies for 12–13 Oct.
export const Notice: S = { name: 'During notice period · last day moves', args: { self: 'Meera Iyer', from: new Date(2026, 9, 12), to: new Date(2026, 9, 13) } };
export const Unpaid: S = { name: 'Leave without pay · taken, no balance', args: { type: 'LWP' } };
export const Sent: S = { name: 'Sent', args: { sent: true } };
export const Phone: S = { name: 'Phone', args: { surface: 'phone' }, ...phone };
