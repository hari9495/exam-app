import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayrollSetupScreen } from './comp-setup';

const meta: Meta<typeof PayrollSetupScreen> = { title: 'Screens/Pay/PAY-16 · Payroll set-up wizard', component: PayrollSetupScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayrollSetupScreen>;

export const Registrations: S = { name: 'Registrations · completeness check failing' };
export const RegistrationsComplete: S = { name: 'Registrations complete', args: { incomplete: false } };
export const PayGroup: S = { name: 'Pay group and cut-off', args: { step: 'group', incomplete: false } };
export const Opening: S = { name: 'Opening balances · as-paid import', args: { step: 'opening', incomplete: false, imported: true } };
export const Review: S = { name: 'Review', args: { step: 'review', incomplete: false, imported: true } };
