import type { Meta, StoryObj } from '@storybook/react-vite';
import { LongAbsenceCard } from './leave';

const meta: Meta<typeof LongAbsenceCard> = { title: 'Screens/Time/TIM-25 · Long-absence status card', component: LongAbsenceCard, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LongAbsenceCard>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Maternity: S = { name: 'Employee · maternity' };
export const Sabbatical: S = { name: 'HR · sabbatical', args: { kind: 'sabbatical', persona: 'hr' } };
export const Lwp: S = { name: 'HR · long LWP', args: { kind: 'lwp', persona: 'hr' } };
export const Phone: S = { name: 'Phone · maternity', args: { surface: 'phone' }, ...phone };
