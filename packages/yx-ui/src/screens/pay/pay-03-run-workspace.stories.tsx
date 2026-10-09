import type { Meta, StoryObj } from '@storybook/react-vite';
import { RunWorkspaceScreen } from './payroll-run';
import { RUN_ROWS } from './pay-data';

const meta: Meta<typeof RunWorkspaceScreen> = { title: 'Screens/Pay/PAY-03 · Run workspace', component: RunWorkspaceScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof RunWorkspaceScreen>;

export const Payslips: S = { name: 'Payslips tab · in review' };
export const WhyDrawer: S = { name: 'Payslip why-this-number drawer', args: { openRowId: RUN_ROWS[9].id } };
export const Calculating: S = { name: 'Calculating · per-employee progress', args: { phase: 'calculating' } };
export const Failed: S = { name: 'Calculation failed · named fixes', args: { phase: 'failed' } };
export const Variance: S = { name: 'Variance tab · acknowledge', args: { tab: 'variance' } };
export const Inputs: S = { name: 'Inputs tab', args: { tab: 'inputs' } };
export const Validations: S = { name: 'Validations tab', args: { tab: 'validations' } };
export const Approvals: S = { name: 'Approvals tab (finance approver)', args: { tab: 'approvals', persona: 'fin' } };
export const Files: S = { name: 'Files tab · approved', args: { tab: 'files', phase: 'approved' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
