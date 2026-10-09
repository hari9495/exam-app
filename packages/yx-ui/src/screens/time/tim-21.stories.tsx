import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveCardScreen } from './leave';

const meta: Meta<typeof LeaveCardScreen> = { title: 'Screens/Time/TIM-21 · Leave card', component: LeaveCardScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeaveCardScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Employee: S = { name: 'Employee · ledger and projection' };
// `person` comes from links such as TIM-30's "Open Meera's leave card" (args=person:Meera+Krishnan).
export const Hr: S = { name: 'HR', args: { persona: 'hr' }, argTypes: { person: { control: 'text' } } };
export const Adjust: S = { name: 'HR · adjust with reason', args: { persona: 'hr', adjustOpen: true } };
export const Phone: S = { name: 'Phone', args: { surface: 'phone' }, ...phone };
