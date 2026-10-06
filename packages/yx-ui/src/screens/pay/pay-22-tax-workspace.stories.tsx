import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaxWorkspaceScreen } from './employee-pay';

const meta: Meta<typeof TaxWorkspaceScreen> = { title: 'Screens/Pay/PAY-22 · Tax workspace', component: TaxWorkspaceScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TaxWorkspaceScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Overview: S = { name: 'Overview · TDS explanation' };
export const Declarations: S = { name: 'Declarations · choose regime', args: { tab: 'declarations' } };
export const Locked: S = { name: 'Regime locked after cut-off', args: { tab: 'declarations', variant: 'locked' } };
export const Proofs: S = { name: 'Proofs · old-regime variant, rejected line', args: { tab: 'proofs', variant: 'proofs' } };
export const Previous: S = { name: 'Previous employer (Form 12B)', args: { tab: 'previous' } };
export const NonResident: S = { name: 'Residential status · non-resident', args: { tab: 'residential', variant: 'non-resident' } };
export const NoPan: S = { name: 'PAN inoperative warning', args: { variant: 'no-pan' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
export const Phone: S = { name: 'phone', args: { layout: 'phone' }, ...phone };
export const PhoneDeclarations: S = { name: 'phone · declarations', args: { layout: 'phone', tab: 'declarations' }, ...phone };
export const PhoneProofs: S = { name: 'phone · proofs (old-regime variant)', args: { layout: 'phone', tab: 'proofs', variant: 'proofs' }, ...phone };
