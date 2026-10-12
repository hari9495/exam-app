import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExpenseReportsScreen } from './reports';

// Expense reports, wired (batch E5; EXP-09). In the affordance guard set ('screens-expenses-live').
const meta: Meta = { title: 'Screens/Expenses/Live · Reports', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;

export const Spend: S = {
  render: () => (
    <ExpenseReportsScreen
      state="ready"
      kind="summary"
      from="2026-10-01"
      to="2026-10-12"
      report={{ kind: 'summary', from: '2026-10-01', to: '2026-10-12', columns: [{ key: 'category', label: 'Category' }, { key: 'claims', label: 'Claims' }, { key: 'claimed', label: 'Claimed' }, { key: 'approved', label: 'Approved' }], rows: [{ category: 'Hotel and lodging', claims: 4, claimed: '23600.00', approved: '20000.00' }, { category: 'Mileage (own vehicle)', claims: 9, claimed: '6426.00', approved: '6426.00' }] }}
      onKind={noop}
      onRange={noop}
      onExport={ok}
    />
  ),
};
export const GstInput: S = {
  name: 'GST input',
  render: () => (
    <ExpenseReportsScreen
      state="ready"
      kind="gst-input"
      from="2026-10-01"
      to="2026-10-12"
      report={{ kind: 'gst-input', from: '2026-10-01', to: '2026-10-12', columns: [{ key: 'gstin', label: 'GSTIN of supplier' }, { key: 'invoiceNo', label: 'Invoice number' }, { key: 'taxable', label: 'Taxable Value' }, { key: 'cgst', label: 'Central Tax' }, { key: 'sgst', label: 'State/UT Tax' }, { key: 'itc', label: 'ITC status' }], rows: [{ gstin: '27BBBBB2222B1Z5', invoiceNo: 'SV-1182', taxable: '5000.00', cgst: '450.00', sgst: '450.00', itc: 'eligible' }] }}
      onKind={noop}
      onRange={noop}
      onExport={ok}
    />
  ),
};
export const Empty: S = { render: () => <ExpenseReportsScreen state="ready" kind="advance-ageing" from="2026-10-01" to="2026-10-12" report={{ kind: 'advance-ageing', from: '2026-10-01', to: '2026-10-12', columns: [{ key: 'person', label: 'Person' }], rows: [] }} onKind={noop} onRange={noop} onExport={ok} /> };
