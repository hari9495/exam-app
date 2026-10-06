import type { Meta, StoryObj } from '@storybook/react-vite';
import { OneTimePayScreen, SalaryHoldsScreen } from './payroll-inputs';

const meta: Meta<typeof SalaryHoldsScreen> = { title: 'Screens/Pay/PAY-06 · Salary holds and releases', component: SalaryHoldsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof SalaryHoldsScreen>;

export const Default: S = { name: 'Holds by reason · ageing chart' };
export const Release: S = { name: 'Release sheet · next bank file or off-cycle', args: { releaseId: 'h2' } };
export const AddHold: S = { name: 'Hold a salary · reason code', args: { addOpen: true } };
export const AsTab: S = { name: 'Tab on One-time pay and holds', render: () => <OneTimePayScreen tab="holds" /> };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
