import type { Meta, StoryObj } from '@storybook/react-vite';
import { VendorPortalScreen, type VendorPortalProps } from './t9-business';
import { PortalSignInScreen } from './portals-kit';
import { SHARED_JOBS, STAFFING_ACCENT, STAFFING_TENANT, VENDOR, VENDOR_SCORECARD, VENDOR_SUBMISSIONS } from './t9-biz-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-12 · Staffing vendor portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base: VendorPortalProps = { tenant: STAFFING_TENANT, accent: STAFFING_ACCENT, vendor: VENDOR, today: TODAY, tab: 'jobs', jobs: SHARED_JOBS, submissions: VENDOR_SUBMISSIONS, scorecard: VENDOR_SCORECARD };

export const SignIn: S = {
  name: 'Sign in (email OTP)',
  render: () => (
    <PortalSignInScreen
      tenant={STAFFING_TENANT}
      portal="Vendor portal"
      accent={STAFFING_ACCENT}
      footer={{ privacy: 'Privacy notice for staffing vendors (G-09)' }}
      signIn={{ title: 'Sign in to the vendor portal', intro: 'Use the email in your vendor agreement.', notice: 'privacy notice for staffing vendors (G-09)' }}
    />
  ),
};
export const NotActive: S = { name: 'Account not active yet', render: () => <VendorPortalScreen {...base} inactive /> };
export const SharedJobs: S = { name: 'Shared jobs (limit reached, expired)', render: () => <VendorPortalScreen {...base} /> };
export const Submit: S = { name: 'Submit candidate', render: () => <VendorPortalScreen {...base} tab="submit" /> };
export const OverRateCap: S = { name: 'Submit · over the rate cap', render: () => <VendorPortalScreen {...base} tab="submit" defaultRate={950} /> };
export const Duplicate: S = { name: 'Submit · duplicate, not accepted', render: () => <VendorPortalScreen {...base} tab="submit" duplicate /> };
export const Submissions: S = { name: 'My submissions', render: () => <VendorPortalScreen {...base} tab="submissions" /> };
export const Invoices: S = { name: 'Proposed invoice', render: () => <VendorPortalScreen {...base} tab="invoices" /> };
export const Scorecard: S = { render: () => <VendorPortalScreen {...base} tab="scorecard" /> };
export const Phone: S = { name: 'Shared jobs · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <VendorPortalScreen {...base} /> };
export const Empty: S = { name: 'No jobs shared', render: () => <VendorPortalScreen {...base} jobs={[]} /> };
