import type { Meta, StoryObj } from '@storybook/react-vite';
import { VendorsScreen } from './hiring-staffing';
import { PRIOR_SUBMISSIONS, VENDORS, VENDOR_SUBMISSIONS } from './hiring-data';
import { TODAY } from '../_kit/data';
import { ShareJobSheet, VendorSheet } from './staffing-sheets';

const meta: Meta = { title: 'Screens/Hiring/HIR-21 · Staffing vendors', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const base = { vendors: VENDORS, submissions: VENDOR_SUBMISSIONS, prior: PRIOR_SUBMISSIONS, today: TODAY };

export const Register: S = { name: 'Register · one vendor pending documents', render: () => <VendorsScreen {...base} /> };
export const ShareJob: S = { name: 'Share job · rate cap and masked client', render: () => <VendorsScreen {...base} shareOpen /> };
export const Submissions: S = { name: 'Vendor submissions · duplicate and over cap', render: () => <VendorsScreen {...base} defaultTab="submissions" /> };
export const Invoices: S = { name: 'Vendor invoices · proposed from hours', render: () => <VendorsScreen {...base} defaultTab="invoices" /> };
export const Scorecards: S = { name: 'Scorecards', render: () => <VendorsScreen {...base} defaultTab="scorecards" /> };
export const Empty: S = { name: 'Empty register', render: () => <VendorsScreen {...base} vendors={[]} submissions={[]} /> };

// Drawn for the live page (staffing slice 2): add a vendor with its documents; share a client job (cap from the target
// margin, complete vendors only).
export const AddVendor: S = {
  name: 'Add vendor · documents',
  render: () => (
    <>
      <VendorsScreen {...base} />
      <VendorSheet open onOpenChange={() => {}} initial={null} onSave={async () => {}} />
    </>
  ),
};
export const ShareClientJob: S = {
  name: 'Share client job · cap suggested, incomplete vendor blocked',
  render: () => (
    <>
      <VendorsScreen {...base} />
      <ShareJobSheet
        open
        onOpenChange={() => {}}
        today={TODAY}
        jobs={[{ value: 'j1', label: 'Java Developer · Nilgiri Retail' }]}
        vendors={[
          { value: 'v1', label: 'Sahyadri Staffing LLP', description: 'Preferred', complete: true },
          { value: 'v3', label: 'Konkan Talent', description: 'Missing: PAN, verified bank account', complete: false },
        ]}
        loadOptions={async () => ({ job: { id: 'j1', title: 'Java Developer', status: 'open' }, client: 'Nilgiri Retail Pvt Ltd', billRate: '1200.00', unit: 'hour', targetMarginPct: 25, suggestedCap: '900.00', sharedWith: [] })}
        onSave={async () => {}}
      />
    </>
  ),
};
