import type { Meta, StoryObj } from '@storybook/react-vite';
import { BillingWorkbenchScreen, type WipRow } from './projects-billing';
import { PD } from './projects-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Projects/PRJ-05 · Billing workbench', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const WIP: WipRow[] = [
  { id: 'b1', client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', project: 'NRP-WEB', source: 'Timesheet hours', detail: 'Priya Nair, senior developer, 120 h × ₹2,200', hours: 120, amount: 2_64_000 },
  { id: 'b2', client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', project: 'NRP-WEB', source: 'Timesheet hours', detail: 'Rohit Bhat, developer, 160 h × ₹1,600', hours: 160, amount: 2_56_000 },
  { id: 'b3', client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', project: 'NRP-WEB', source: 'Timesheet hours', detail: 'Divya Raghunathan, QA lead, 80 h × ₹1,800', hours: 80, amount: 1_44_000 },
  { id: 'b4', client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', project: 'NRP-WEB', source: 'Timesheet hours', detail: 'Sana Nizami, developer, 40 h', hours: 40, amount: 64_000, held: 'waiting for client approval' },
  { id: 'b5', client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', project: 'NRP-WEB', source: 'Expense rebill', detail: 'Travel to client, 10 Sep', amount: 4_860 },
  { id: 'b6', client: 'Coromandel Logistics Ltd', clientState: 'Karnataka', project: 'CLL-WMS', source: 'Milestone', detail: 'Integration live in 3 warehouses (40%)', amount: 12_00_000, held: 'waiting for client acceptance' },
  { id: 'b7', client: 'Deccan Pharma Pvt Ltd', clientState: 'Telangana', project: 'DPH-QMS', source: 'Retainer', detail: 'October retainer', amount: 1_20_000 },
];

export const Wip: S = { name: 'Finance · WIP by client, held items', render: () => <BillingWorkbenchScreen rows={WIP} today={TODAY} now={TODAY} /> };
export const Drafts: S = { name: 'Draft invoices · CGST/SGST and IGST', render: () => <BillingWorkbenchScreen rows={WIP} today={TODAY} defaultStep="drafts" now={TODAY} /> };
export const Approve: S = { name: 'Approve and issue · e-invoice window', render: () => <BillingWorkbenchScreen rows={WIP} today={TODAY} defaultStep="approve" now={TODAY} /> };
export const OldDraft: S = { name: 'Approve · draft dated 27 Aug, IRN blocked', render: () => <BillingWorkbenchScreen rows={WIP} today={TODAY} defaultStep="approve" draftDate={PD(2026, 8, 27)} now={TODAY} /> };
export const Issued: S = { name: 'Issued', render: () => <BillingWorkbenchScreen rows={WIP} today={TODAY} issued now={TODAY} /> };
export const Empty: S = { name: 'Empty · nothing to bill', render: () => <BillingWorkbenchScreen rows={[]} today={TODAY} now={TODAY} /> };
