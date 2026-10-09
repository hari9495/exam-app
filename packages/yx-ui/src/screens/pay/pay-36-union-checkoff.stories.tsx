import type { Meta, StoryObj } from '@storybook/react-vite';
import { UnionCheckoffScreen } from './special-pay';

const meta: Meta<typeof UnionCheckoffScreen> = { title: 'Screens/Pay/PAY-36 · Union check-off', component: UnionCheckoffScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof UnionCheckoffScreen>;

export const Authorisations: S = { name: 'Authorisations' };
export const Deductions: S = { name: 'Monthly deduction list', args: { tab: 'deductions' } };
export const Remittance: S = { name: 'Remittance per union', args: { tab: 'remit' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
