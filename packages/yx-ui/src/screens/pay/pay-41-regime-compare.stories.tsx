import type { Meta, StoryObj } from '@storybook/react-vite';
import { RegimeCompareScreen, TaxWorkspaceScreen } from './employee-pay';

const meta: Meta<typeof RegimeCompareScreen> = { title: 'Screens/Pay/PAY-41 · Compare tax regimes', component: RegimeCompareScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof RegimeCompareScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const NewLower: S = { name: 'New regime lower' };
export const OldLower: S = {
  name: 'What-if · old regime lower (rent and home loan)',
  args: { props: { defaultExtra: { invest: 0, rent: 45_000, homeLoan: 2_00_000, nps: 0 } } },
};
// Pay structure scaled to ₹9,50,000 a year: basic 40% (₹31,700 a month), HRA half of basic.
export const NonResident: S = { name: 'Non-resident · no rebate', args: { props: { resident: false, gross: 9_50_000, basicMonthly: 31_700, hraMonthly: 15_850 } } };
export const InWorkspace: S = { name: 'Inside the tax workspace', render: () => <TaxWorkspaceScreen tab="compare" /> };
export const Phone: S = { name: 'phone', args: { layout: 'phone' }, ...phone };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
