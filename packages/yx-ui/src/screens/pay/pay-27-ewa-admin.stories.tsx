import type { Meta, StoryObj } from '@storybook/react-vite';
import { EwaAdminScreen } from './admin-tax-loans';

const meta: Meta<typeof EwaAdminScreen> = { title: 'Screens/Pay/PAY-27 · EWA admin', component: EwaAdminScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof EwaAdminScreen>;

export const Draws: S = { name: 'Draws this period' };
export const Policy: S = { name: 'Policy editor (Settings)', args: { tab: 'policy' } };
export const Partner: S = { name: 'Partner connection', args: { tab: 'partner' } };
export const NoPartner: S = { name: 'Partner not connected', args: { tab: 'partner', partner: 'not-connected' } };
export const Recoveries: S = { name: 'Recoveries in payroll', args: { tab: 'recoveries' } };
export const Reconciliation: S = { name: 'Reconciliation (finance approver)', args: { tab: 'recon', persona: 'fin' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
