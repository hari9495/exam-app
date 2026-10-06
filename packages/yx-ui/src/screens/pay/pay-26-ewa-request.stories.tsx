import type { Meta, StoryObj } from '@storybook/react-vite';
import { EwaRequestScreen } from './employee-pay';

const meta: Meta<typeof EwaRequestScreen> = { title: 'Screens/Pay/PAY-26 · Earned wage access request', component: EwaRequestScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof EwaRequestScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Available: S = { name: 'phone · available amount', ...phone };
export const Confirm: S = { name: 'phone · fee and recovery disclosure', args: { variant: 'confirm' }, ...phone };
export const Disbursed: S = { name: 'phone · sent to salary account', args: { variant: 'disbursed' }, ...phone };
export const Blackout: S = { name: 'phone · blackout before cut-off', args: { variant: 'blackout' }, ...phone };
export const OnHold: S = { name: 'phone · not available, salary on hold', args: { variant: 'on-hold' }, ...phone };
export const DrawsUsed: S = { name: 'phone · all draws used', args: { variant: 'draws-used' }, ...phone };
export const Desktop: S = { name: 'Desktop', args: { layout: 'desktop' } };
export const DesktopConfirm: S = { name: 'Desktop · confirm', args: { layout: 'desktop', variant: 'confirm' } };
export const Off: S = { name: 'Off for pay group', args: { layout: 'desktop', variant: 'off' } };
