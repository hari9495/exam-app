import type { Meta, StoryObj } from '@storybook/react-vite';
import { OptionalHolidaysSheet } from './leave';

const meta: Meta<typeof OptionalHolidaysSheet> = { title: 'Screens/Time/TIM-23 · Optional holidays', component: OptionalHolidaysSheet, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof OptionalHolidaysSheet>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Choose: S = { name: 'Choose 2 of 5' };
export const OverLimit: S = { name: 'At the limit · others locked', args: { chosen: ['o1', 'o3'] } };
export const Prorated: S = { name: 'Prorated after transfer', args: { transferred: true } };
export const Phone: S = { name: 'Phone', args: { surface: 'phone' }, ...phone };
