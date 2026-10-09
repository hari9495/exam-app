import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContractorPortalScreen, type ContractorPortalProps } from './t9-business';
import { PortalSignInScreen } from './portals-kit';
import { CL_BILLS, CL_ESTABLISHMENTS, CL_PACK, CL_WORKERS, CONTRACTOR } from './t9-biz-data';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-13 · Contract-labour vendor portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base: ContractorPortalProps = {
  tenant: TENANT,
  accent: KAVERI_ACCENT,
  contractor: CONTRACTOR,
  today: TODAY,
  tab: 'establishments',
  establishments: CL_ESTABLISHMENTS,
  workers: CL_WORKERS,
  pack: CL_PACK,
  bills: CL_BILLS,
};

export const SignIn: S = {
  name: 'Sign in (email OTP)',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Contractor portal"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for contract-labour vendors (G-09)' }}
      signIn={{ title: 'Sign in to the contractor portal', intro: 'Use the email in your contract with Kaveri Foods.' }}
    />
  ),
};
export const Licences: S = { name: 'Establishments and licence renewals', render: () => <ContractorPortalScreen {...base} /> };
export const Workers: S = { render: () => <ContractorPortalScreen {...base} tab="workers" /> };
export const UnderAge: S = { name: 'Add worker · under 18 blocked', render: () => <ContractorPortalScreen {...base} tab="workers" addWorker={{ dob: new Date(2009, 2, 3), establishmentId: 'hsr' }} /> };
export const LicenceFull: S = {
  name: 'Add worker · licence maximum reached',
  render: () => (
    <ContractorPortalScreen
      {...base}
      tab="workers"
      establishments={CL_ESTABLISHMENTS.map((e) => (e.id === 'hsr' ? { ...e, deployed: 50 } : e))}
      addWorker={{ dob: new Date(1996, 5, 11), establishmentId: 'hsr' }}
    />
  ),
};
export const Pack: S = { name: 'Monthly pack · short challan', render: () => <ContractorPortalScreen {...base} tab="packs" /> };
export const PackVerified: S = {
  name: 'Monthly pack · verified',
  render: () => (
    <ContractorPortalScreen
      {...base}
      tab="packs"
      bills={CL_BILLS.map((b) => ({ ...b, status: 'Paid' as const }))}
      pack={{ ...CL_PACK, month: 'July 2026', status: 'verified', items: CL_PACK.items.map((i) => ({ ...i, state: 'verified' as const, note: undefined })), checks: CL_PACK.checks.map((c) => ({ ...c, ok: true })) }}
    />
  ),
};
export const Bills: S = { name: 'Bills · payment on hold', render: () => <ContractorPortalScreen {...base} tab="bills" /> };
export const Phone: S = { name: 'Monthly pack · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <ContractorPortalScreen {...base} tab="packs" /> };
