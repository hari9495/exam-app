import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyMatrixScreen } from './expenses-finance';
import { POLICY_MATRIX } from './expenses-data';
import { POLICY_SETUP } from './expenses-setup-samples';

const meta: Meta = { title: 'Screens/Expenses/EXP-07 · Expense policy matrix', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Matrix: S = { name: 'Matrix (finance edits)', render: () => <PolicyMatrixScreen matrix={POLICY_MATRIX} /> };
export const Unsaved: S = { name: 'Unsaved changes · new version', render: () => <PolicyMatrixScreen matrix={POLICY_MATRIX} dirty /> };
export const HrReadOnly: S = { name: 'HR (read only)', render: () => <PolicyMatrixScreen matrix={POLICY_MATRIX} persona="hr" /> };

// The real set-up (founder answer 6), drawn with the designed screen and sample data.
const live = POLICY_SETUP;
export const GradeBands: S = { name: 'Grade band grid · other policies listed below', render: () => <PolicyMatrixScreen live={live} /> };
export const CopyPolicy: S = { name: 'Copy as a new policy (for one grade)', render: () => <PolicyMatrixScreen live={live} defaultSheet="copy" /> };
export const Rates: S = { name: 'Mileage & per diem · add a rate', render: () => <PolicyMatrixScreen live={live} defaultTab="rates" defaultSheet="mileage" /> };
export const Categories: S = { name: 'Receipts & over-limit · categories', render: () => <PolicyMatrixScreen live={live} defaultTab="rules" /> };
export const EditCategory: S = { name: 'Category · receipt threshold, GST, ledger code', render: () => <PolicyMatrixScreen live={live} defaultTab="rules" defaultSheet="category" /> };
export const Tiers: S = { name: 'City tiers', render: () => <PolicyMatrixScreen live={live} defaultTab="tiers" /> };
export const Gst: S = { name: 'GST registrations · add one', render: () => <PolicyMatrixScreen live={live} defaultTab="gst" defaultSheet="gst" /> };
export const ExchangeRates: S = { name: 'Exchange rates', render: () => <PolicyMatrixScreen live={{ ...live, payCurrency: 'INR', fxRates: [{ id: 'x1', source: 'company', base: 'AED', quote: 'INR', rateDate: '2026-10-01', rate: '22.75000000' }], onAddFxRate: async () => ({}) }} defaultTab="fx" /> };
export const Starters: S = { name: 'New company · start from the starters', render: () => <PolicyMatrixScreen live={{ ...live, categories: [] }} /> };
