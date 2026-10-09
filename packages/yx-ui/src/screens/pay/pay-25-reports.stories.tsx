import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayrollReportsScreen, ReportsNoAccess } from './admin-tax-loans';

const meta: Meta<typeof PayrollReportsScreen> = { title: 'Screens/Pay/PAY-25 · Payroll reports', component: PayrollReportsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayrollReportsScreen>;

export const Register: S = { name: 'Salary register' };
export const Reconciliation: S = { name: 'Reconciliation (finance approver)', args: { report: 'recon', persona: 'fin' } };
export const Variance: S = { name: 'Variance · chart and table', args: { report: 'variance' } };
export const Ctc: S = { name: 'CTC by department', args: { report: 'ctc' } };
export const Arrears: S = { name: 'Arrears', args: { report: 'arrears' } };
export const Ytd: S = { name: 'Year to date', args: { report: 'ytd' } };
export const BankAdvice: S = { name: 'Bank advice', args: { report: 'bank' } };
export const HoldAgeing: S = { name: 'Hold ageing', args: { report: 'holds' } };
export const Gratuity: S = { name: 'Gratuity provision', args: { report: 'gratuity' } };
export const LoanLedger: S = { name: 'Loan ledger', args: { report: 'loans' } };
export const Empty: S = { name: 'Empty · no data for filters', args: { report: 'holds', group: 'tn' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const NoAccess: S = { name: 'No access (HR without payroll scope)', render: () => <ReportsNoAccess /> };
