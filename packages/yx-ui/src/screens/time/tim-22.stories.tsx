import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompOffClaim } from './leave';

const meta: Meta<typeof CompOffClaim> = { title: 'Screens/Time/TIM-22 · Comp-off claim', component: CompOffClaim, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof CompOffClaim>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Claim: S = { name: 'Claim' };
export const None: S = { name: 'No eligible days', args: { state: 'none' } };
export const Sent: S = { name: 'Sent', args: { state: 'sent' } };
export const Phone: S = { name: 'Phone', args: { surface: 'phone' }, ...phone };
