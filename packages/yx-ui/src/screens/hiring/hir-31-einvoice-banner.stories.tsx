import type { Meta, StoryObj } from '@storybook/react-vite';
import { EInvoiceBanner } from './hiring-kit';
import { InvoiceRecordScreen } from './hiring-staffing';
import { D, INVOICES } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-31 · E-invoice window banner', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LINES = [{ description: 'Aravind Kumar · Java Developer · 160 h', qty: 160, rate: 1_200 }];

export const DayTen: S = { name: 'Day 10 · within window', render: () => <EInvoiceBanner invoiceDate={D(2026, 9, 19)} today={TODAY} invoiceNo="KF/TN/26-27/0190" /> };
export const DayTwentyEight: S = { name: 'Day 28 · warning from day 25', render: () => <EInvoiceBanner invoiceDate={D(2026, 9, 1)} today={TODAY} invoiceNo="KF/TN/26-27/0184" /> };
export const DayThirtyThree: S = { name: 'Day 33 · blocked after day 30', render: () => <EInvoiceBanner invoiceDate={D(2026, 8, 27)} today={TODAY} invoiceNo="KF/TN/26-27/0179" /> };
export const BelowThreshold: S = { name: 'Entity below threshold · not applicable', render: () => <EInvoiceBanner invoiceDate={D(2026, 8, 27)} today={TODAY} aboveThreshold={false} invoiceNo="KF/TN/26-27/0179" /> };
export const OnInvoice: S = { name: 'On the invoice · Send for IRN blocked', render: () => <InvoiceRecordScreen invoice={INVOICES[1]} lines={LINES} supplierState="Tamil Nadu" today={TODAY} /> };
