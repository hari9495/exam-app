import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsultantsScreen } from './consultants';

const meta: Meta<typeof ConsultantsScreen> = { title: 'Screens/Pay/PAY-55 · Consultants', component: ConsultantsScreen, render: (args) => <ConsultantsScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ConsultantsScreen>;

export const Invoices: S = { name: 'Invoices · TDS and what to pay' };
export const Register: S = { name: 'Register · PAN and bank check', args: { tab: 'register' } };
export const BankFiles: S = { name: 'Bank files · made by one, released by another', args: { tab: 'payments' } };
export const AddConsultant: S = { name: 'Add consultant', args: { tab: 'register', dialog: 'add' } };
export const BankCheck: S = { name: 'Record bank check', args: { tab: 'register', dialog: 'bank' } };
export const Certificate197: S = { name: 'Lower deduction certificate (s.197)', args: { tab: 'register', dialog: 'certificate' } };
export const EnterInvoice: S = { name: 'Enter an invoice', args: { dialog: 'invoice' } };
export const MakeBankFile: S = { name: 'Make bank file', args: { dialog: 'payout' } };
export const Release: S = { name: 'Release bank file · typed phrase', args: { tab: 'payments', dialog: 'release' } };
export const Results: S = { name: 'Record bank results', args: { tab: 'payments', dialog: 'results' } };
export const ViewOnly: S = { name: 'Release only (no consultant key)', args: { tab: 'payments', can: { manage: false } } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const LoadError: S = { name: 'Error · retry', args: { state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access' } };
