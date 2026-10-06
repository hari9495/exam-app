import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayrollHomeScreen } from './payroll-run';

const meta: Meta<typeof PayrollHomeScreen> = { title: 'Screens/Pay/PAY-01 · Payroll home', component: PayrollHomeScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayrollHomeScreen>;

export const InReviewBlocked: S = { name: 'In review · blocked (payroll admin)', args: { stage: 'In review' } };
export const FinanceApprover: S = { name: 'Finance approver', args: { persona: 'fin', stage: 'In review' } };
export const ReadyToApprove: S = { name: 'Nothing blocking (finance approver)', args: { persona: 'fin', stage: 'In review', blockers: [] } };
export const Approved: S = { name: 'Approved · bank file next', args: { stage: 'Approved and locked', blockers: [] } };
export const Paid: S = { name: 'Paid · publish next', args: { stage: 'Paid', blockers: [] } };
export const Draft: S = { name: 'Draft · new month', args: { stage: 'Draft', blockers: [] } };
export const FirstUse: S = { name: 'Empty · payroll not set up', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
