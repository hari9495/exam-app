import type { Meta, StoryObj } from '@storybook/react-vite';
import { EncashmentRequest } from './leave';

const meta: Meta<typeof EncashmentRequest> = { title: 'Screens/Time/TIM-24 · Encashment request', component: EncashmentRequest, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof EncashmentRequest>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Request: S = { name: 'Request · amount preview' };
export const OverMax: S = { name: 'Over what you can encash', args: { days: 9 } };
export const NotOpen: S = { name: 'Request already waiting', args: { blocked: true } };
export const Phone: S = { name: 'Phone', args: { surface: 'phone' }, ...phone };
