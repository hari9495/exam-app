import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveCardScreen } from './leave';

const meta: Meta<typeof LeaveCardScreen> = { title: 'Screens/Time/TIM-21 · Leave card', component: LeaveCardScreen, render: (args) => <LeaveCardScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeaveCardScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Employee: S = { name: 'Employee · ledger and projection' };
// `person` comes from links such as TIM-30's "Open Meera's leave card" (args=person:Meera+Krishnan).
export const Hr: S = { name: 'HR', args: { persona: 'hr' }, argTypes: { person: { control: 'text' } } };
export const Adjust: S = { name: 'HR · adjust with reason', args: { persona: 'hr', adjustOpen: true } };
export const Phone: S = { name: 'Phone', args: { surface: 'phone' }, ...phone };
// Batch A D10 (answer 2314): everyone in HR's scope by leave type; a cell opens the correction with a reason.
export const BalanceGrid: S = { name: 'HR · balance grid', args: { persona: 'hr', view: 'grid' } };
export const CorrectBalance: S = { name: 'HR · balance grid · correct with reason', args: { persona: 'hr', view: 'grid', correctOpen: true } };
// Answer 2325: HR's view of a person's approved leave, Cancel some days in HR mode (any day, a reason, at once).
export const HrCancelSomeDays: S = { name: 'HR · cancel some days of approved leave', args: { persona: 'hr', person: 'Sanjay Rao', cancelDaysOpen: true } };
