import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompensationScreen } from './comp-setup';

const meta: Meta<typeof CompensationScreen> = { title: 'Screens/Pay/PAY-12 · Compensation and revision', component: CompensationScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof CompensationScreen>;

export const Tab: S = { name: 'Compensation tab · breakup and history' };
export const Revision: S = { name: 'Revision sheet · effect summary', args: { variant: 'revision' } };
export const Arrears: S = { name: 'Back-dated revision · arrears preview', args: { variant: 'revision-arrears' } };
export const Hourly: S = { name: 'Pay basis · hourly rate (placement)', args: { variant: 'hourly' } };
export const HrPersona: S = { name: 'HR view', args: { persona: 'hr' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
