import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldForceScreen } from './field';

const meta: Meta<typeof FieldForceScreen> = { title: 'Screens/Time/TIM-32 · Field-force map', component: FieldForceScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof FieldForceScreen>;

export const Manager: S = { name: 'Manager · live map' };
export const Hr: S = { name: 'HR · all field staff', args: { persona: 'hr' } };
export const Person: S = { name: 'Person trail and visits', args: { openId: 'v' } };
export const Flagged: S = { name: 'Integrity flag', args: { openId: 's' } };
export const Off: S = { name: 'Tracking off for group', args: { state: 'empty' } };
export const NotOnDuty: S = { name: 'Person not checked in', args: { openId: 'b' } };
export const NoTrail: S = { name: 'Consent withdrawn · no trail', args: { openId: 'p' } };
