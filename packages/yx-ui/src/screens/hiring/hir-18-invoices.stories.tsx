import type { Meta, StoryObj } from '@storybook/react-vite';
import { InvoiceRecordScreen, InvoicesScreen } from './hiring-staffing';
import { CreateInvoicesSheet, ExportSheet } from './staffing-sheets';
import { D, INVOICES } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-18 · Invoices', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LINES = [
  { description: 'Aravind Kumar · Java Developer · 160 h', qty: 160, rate: 1_200 },
  { description: 'Sowmya Ramesh · Senior Java Developer · 152 h', qty: 152, rate: 1_650 },
  { description: 'Priya Nair · Java Developer · 160 h', qty: 160, rate: 1_200 },
];

export const Finance: S = { name: 'Finance · invoice list', render: () => <InvoicesScreen rows={INVOICES} today={TODAY} /> };
export const AccountManager: S = { name: 'Account manager · read only', render: () => <InvoicesScreen rows={INVOICES} today={TODAY} persona="am" /> };
export const IntraState: S = {
  name: 'Invoice · CGST + SGST, credit note',
  render: () => (
    <InvoiceRecordScreen
      invoice={{ ...INVOICES[0], irn: 'Generated' }}
      lines={LINES}
      supplierState="Tamil Nadu"
      today={TODAY}
      creditNotes={[{ number: 'KF/TN/26-27/CN-012', date: D(2026, 9, 20), amount: -11_328, reason: '8 h duplicate on 14 Aug corrected' }]}
    />
  ),
};
export const InterState: S = { name: 'Invoice · IGST (inter-state)', render: () => <InvoiceRecordScreen invoice={{ ...INVOICES[3], irn: 'Generated' }} lines={LINES.slice(0, 1)} supplierState="Tamil Nadu" today={TODAY} /> };
export const IrnWarning: S = { name: 'Invoice · IRN day 28 warning', render: () => <InvoiceRecordScreen invoice={INVOICES[0]} lines={LINES} supplierState="Tamil Nadu" today={TODAY} /> };
export const Empty: S = { name: 'Empty', render: () => <InvoicesScreen rows={[]} today={TODAY} /> };
export const Error: S = { name: 'Error', render: () => <InvoicesScreen rows={[]} today={TODAY} state="error" /> };

// Drawn for the live page (staffing slice 3): drafts from approved hours for a client and month, numbered on issue.
export const CreateInvoices: S = {
  name: 'Create invoices · from approved hours',
  render: () => (
    <>
      <InvoicesScreen rows={INVOICES} today={TODAY} />
      <CreateInvoicesSheet open onOpenChange={() => {}} options={{ clients: [{ id: 'c1', name: 'Nilgiri Retail Pvt Ltd', months: ['2026-09'] }], series: [{ id: 's1', label: 'KF/TN/26-27/ · 33AABCK1234F1Z9 · 2026-27', financialYear: '2026-27' }] }} onSave={async () => {}} />
    </>
  ),
};
export const Draft: S = {
  name: 'Invoice · draft before issue',
  render: () => (
    <InvoiceRecordScreen
      live={{
        state: 'ready',
        onRetry: () => {},
        onIssue: async () => {},
        onDelete: async () => {},
        onCreditNote: async () => {},
        onReissue: async () => {},
        onOpen: () => {},
        data: {
          canEdit: true,
          invoice: { id: 'i1', number: null, kind: 'staffing', creditOf: null, client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', supplierState: 'Karnataka', interState: true, gstPct: '18', date: null, dueOn: null, period: '2026-09-01 to 2026-09-30', po: 'PO-7781', reason: null, taxable: '192000.00', cgst: '0.00', sgst: '0.00', igst: '34560.00', total: '226560.00', paid: '0.00', outstanding: '226560.00', status: 'draft', irn: 'pending', version: 1, window: null },
          lines: [{ description: 'Aravind Kumar · Java Developer · 160 h', qty: '160', rate: '1200.00', amount: '192000.00' }],
          creditNotes: [],
          rule: { reportWithinDays: 30, warnFromDay: 25 },
        },
      }}
    />
  ),
};
// Drawn for answer 522: a month of one GSTIN series to Tally (XML) or Zoho Books (CSV); drafts are named and left out.
export const ExportToAccounting: S = {
  name: 'Export to accounting · Tally or Zoho Books',
  render: () => (
    <>
      <InvoicesScreen rows={INVOICES} today={TODAY} />
      <ExportSheet open onOpenChange={() => {}} options={{ series: [{ id: 's1', label: 'KF/TN/26-27/ · 33AABCK1234F1Z9 · 2026-27', months: ['2026-10', '2026-09'], drafts: 2 }] }} onExport={async () => {}} />
    </>
  ),
};
