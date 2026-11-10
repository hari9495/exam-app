import type { Meta, StoryObj } from '@storybook/react-vite';
import { VendorInvoices as VendorInvoicesView, VendorsScreen } from './hiring-staffing';
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
// Drawn for answer 489: the design's Review dispute opens an override with a reason (account managers).
export const ReviewDispute: S = {
  name: 'Review dispute · override the duplicate with a reason',
  render: () => (
    <VendorsScreen
      live={{
        state: 'ready',
        onRetry: () => {},
        vendors: [],
        showRegister: false,
        defaultTab: 'submissions',
        defaultDisputeId: 'a2',
        submissions: [{ id: 'a2', vendor: 'Konkan Talent', candidate: 'Ravi Kumar', job: 'Java Developer', jobId: 'j1', clientJob: true, at: '2026-11-09T10:00:00Z', quoted: '850.00', cap: '900.00', overBy: null, overCap: false, exception: null, duplicate: { holder: 'Sahyadri Staffing LLP', until: '2027-02-07' }, rightToRepresent: true, consent: true, status: 'pending' }],
        canManage: true,
        canForward: true,
        canReview: false,
        onAdd: () => {},
        onEdit: () => {},
        onShare: () => {},
        onException: async () => {},
        loadContacts: async () => [],
        onForward: async () => {},
        onAccept: async () => {},
        onReject: async () => {},
        onOverride: async () => {},
      }}
    />
  ),
};
// Drawn for answer 496: each vendor links to its consultant record in payroll; confirmed invoices are paid there.
export const VendorInvoicesPayroll: S = {
  name: 'Vendor invoices · linked to payroll (PAY 8)',
  render: () => (
    <VendorInvoicesView
      live={{
        canEdit: true,
        onConfirm: async () => {},
        onPaid: async () => {},
        onLink: async () => {},
        vendors: [{ id: 'v1', name: 'Sahyadri Staffing LLP', consultantId: 'k1' }, { id: 'v2', name: 'Konkan Talent', consultantId: null }],
        consultants: [{ value: 'k1', label: 'Sahyadri Staffing LLP · PAN …234F · 194C · Kaveri Foods Pvt Ltd' }],
        rows: [
          { id: null, status: 'waiting', vendorInvoiceNo: null, vendor: 'Sahyadri Staffing LLP', worker: 'Priya Nair', placementId: 'p1', month: '2026-10', hours: '160', rate: '900.00', net: '144000.00', gst: '25920.00', tdsSection: '194C', tds: '2880.00' },
          { id: 'b1', status: 'confirmed', vendorInvoiceNo: 'SS/26-27/044', vendor: 'Sahyadri Staffing LLP', worker: 'Priya Nair', placementId: 'p1', month: '2026-09', hours: '152', rate: '900.00', net: '136800.00', gst: '24624.00', tdsSection: '194C', tds: '2736.00', payroll: { status: 'approved', paidOn: null, tds: '2736.00' } },
        ],
      }}
    />
  ),
};
