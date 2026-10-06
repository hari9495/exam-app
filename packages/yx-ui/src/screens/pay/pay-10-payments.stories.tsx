import type { Meta, StoryObj } from '@storybook/react-vite';
import { PaymentsScreen } from './payroll-inputs';

const meta: Meta<typeof PaymentsScreen> = { title: 'Screens/Pay/PAY-10 · Payments and files', component: PaymentsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PaymentsScreen>;

export const Status: S = { name: 'Payment status · failures' };
export const Failure: S = { name: 'Returned payment · re-pay route', args: { failure: 'Returned' } };
export const FailedIfsc: S = { name: 'Failed payment · waiting for corrected IFSC', args: { failure: 'Failed' } };
export const Register: S = { name: 'Disbursement register · cash and cheque', args: { tab: 'register' } };
export const Files: S = { name: 'Bank files', args: { tab: 'files' } };
export const Journal: S = { name: 'Journal export (finance approver)', args: { tab: 'journal', persona: 'fin' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
