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

// CL-3 (answers 631, 636, 678): what is due, the work orders, the renewal upload and its outcomes.
const DUE = [
  { tone: 'danger' as const, text: 'Licence TN/CLRA/CHN/2026/0107 for Chennai office · facility ends in 7 days (6 Oct 2026). Upload the renewed licence.' },
  { tone: 'warning' as const, text: "Siddharth Naik's gate pass GP-HSR-0902 ends on 15 Oct 2026." },
  { tone: 'info' as const, text: '1 worker is waiting for site approval.' },
];
const ORDERS = [{ id: 'wo1', number: 'WO/HSR/2026-27/14', from: new Date(2026, 3, 1), to: new Date(2027, 2, 31), headcount: 50, active: 48, sites: ['Hosur plant'] }];
export const Due: S = { name: 'What is due and work orders (CL-3)', render: () => <ContractorPortalScreen {...base} due={DUE} workOrders={ORDERS} /> };
export const RenewUpload: S = { name: 'Upload a renewed licence (CL-3)', render: () => <ContractorPortalScreen {...base} due={DUE} renewingId="maa" /> };
export const RenewalChecked: S = {
  name: 'Renewal being checked, renewal not accepted (CL-3)',
  render: () => (
    <ContractorPortalScreen
      {...base}
      due={[{ tone: 'info', text: 'Renewal TN/CLRA/CHN/2026/0311 for Chennai office · facility is being checked by Kaveri Foods.' }, { tone: 'danger', text: 'Renewal TN/CLRA/HSR/2026/0590 for Hosur plant · packing was not accepted: the copy is unreadable. Upload it again.' }]}
      establishments={CL_ESTABLISHMENTS.map((e) => (e.id === 'maa' ? { ...e, renewal: { licenceNo: 'TN/CLRA/CHN/2026/0311', status: 'pending' as const, validTo: new Date(2027, 9, 6) } } : e.id === 'hsr' ? { ...e, renewal: { licenceNo: 'TN/CLRA/HSR/2026/0590', status: 'rejected' as const, validTo: new Date(2027, 10, 20), rejectReason: 'The copy is unreadable.' } } : e))}
    />
  ),
};
export const NothingDue: S = { name: 'Nothing due (CL-3)', render: () => <ContractorPortalScreen {...base} due={[]} workOrders={ORDERS} /> };
export const DuePhone: S = { name: 'What is due · phone (CL-3)', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <ContractorPortalScreen {...base} due={DUE} workOrders={ORDERS} /> };
// CL-4 (answers 626, 634): a proof's upload, and the wage register with each worker's pay against the minimum.
export const UploadChallan: S = { name: 'Monthly pack · upload a challan (CL-4)', render: () => <ContractorPortalScreen {...base} tab="packs" uploading="esi_challan" /> };
export const UploadWages: S = { name: 'Monthly pack · wage register (CL-4)', render: () => <ContractorPortalScreen {...base} tab="packs" uploading="wage_register" /> };
export const Withdraw: S = { name: 'Withdraw a waiting worker (CL-4)', render: () => <ContractorPortalScreen {...base} tab="workers" workers={CL_WORKERS.map((w, i) => (i === 3 ? { ...w, status: 'Pending approval' as const, gatePass: null, gateValidTo: null } : w))} withdrawingId="w4" /> };
