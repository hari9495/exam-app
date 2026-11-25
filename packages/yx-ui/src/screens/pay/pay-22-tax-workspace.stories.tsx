import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaxOnBehalfScreen, TaxWindowCards, TaxWorkspaceScreen } from './employee-pay';
import { DECLARATIONS } from './live/fixtures-ops';

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
/** E1 (batch H part 2): the window cards with the OPEN tag; one opened early by HR, one locked by HR. */
export const WindowCards: S = {
  name: 'Declarations · window cards (open, locked by HR)',
  render: () => (
    <TaxWindowCards
      windows={[
        { key: 'declarations', open: true, from: '2026-04-01', to: '2027-02-28', by: 'dates' },
        { key: 'proofs', open: false, from: '2027-01-01', to: '2027-02-28', by: 'hr_lock' },
      ]}
    />
  ),
};
/** E2 (batch H part 2): HR declares for an employee without a login (Payroll › Tax centre). */
export const OnBehalf: S = {
  name: 'HR declares for an employee (E2)',
  render: () => (
    <TaxOnBehalfScreen
      live={{
        state: 'ready',
        onSearch: async () => [{ id: 'p9', name: 'Murugan S', employeeCode: 'KF-0311' }],
        person: { id: 'p9', name: 'Murugan S', employeeCode: 'KF-0311' },
        onPerson: () => undefined,
        declarations: { ...DECLARATIONS, canDeclare: true, windows: [{ key: 'declarations', open: true, from: '2026-04-01', to: '2027-02-28', by: 'dates' }] },
        onDeclare: async () => undefined,
      }}
    />
  ),
};
