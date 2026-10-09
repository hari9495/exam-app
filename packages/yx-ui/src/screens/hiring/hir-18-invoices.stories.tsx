import type { Meta, StoryObj } from '@storybook/react-vite';
import { InvoiceRecordScreen, InvoicesScreen } from './hiring-staffing';
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
