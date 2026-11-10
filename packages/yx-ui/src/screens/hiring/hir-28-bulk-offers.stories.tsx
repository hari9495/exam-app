import type { Meta, StoryObj } from '@storybook/react-vite';
import { BulkOfferScreen } from './hiring-offers';
import { BULK_OFFERS } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-28 · Bulk offer screen', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const BAND = { min: 4_20_000, max: 5_00_000 };

export const Values: S = { name: 'Per-candidate values · checks', render: () => <BulkOfferScreen rows={BULK_OFFERS} band={BAND} /> };
export const Template: S = { name: 'Template step', render: () => <BulkOfferScreen rows={BULK_OFFERS} band={BAND} defaultStep="template" /> };
export const Preview: S = { name: 'Preview step', render: () => <BulkOfferScreen rows={BULK_OFFERS} band={BAND} defaultStep="preview" /> };
export const Sent: S = { name: 'Sent · batch status', render: () => <BulkOfferScreen rows={BULK_OFFERS} band={BAND} sent /> };
// Answer 514: each Fixed CTC starts blank (never ₹0); Continue with a blank names the rows and opens the first one's cell.
export const ValuesBlank: S = {
  name: 'Per-candidate values · CTC left blank',
  render: () => (
    <BulkOfferScreen
      defaultStep="values"
      live={{
        state: 'ready',
        onRetry: () => {},
        now: new Date(2026, 10, 9),
        onSend: async () => {},
        onOpenOffer: () => {},
        setup: {
          job: { id: 'j1', title: 'Graduate Engineer Trainee', locationId: 'l1' }, company: 'Kaveri Foods Pvt Ltd', grade: 'G3', band: BAND,
          structures: [{ value: 'tv1', label: 'GET CTC' }], locations: [{ value: 'l1', label: 'Hosur plant' }], letters: [{ value: 't1', label: 'Campus LOI', esign: true, subject: 'LOI', body: 'Dear {{candidateName}},' }],
          defaultConditions: [], expiryDays: 7, plan: { check: 'off', linked: false, free: null }, route: { steps: [], bandStep: { name: 'Above the pay range (HR head)', approvers: ['Lakshmi'] } },
          candidates: [{ entryId: 'e1', name: 'Aditi Rao', email: 'aditi@mail.test' }, { entryId: 'e2', name: 'Farhan Sheikh', email: 'farhan@mail.test' }],
        },
      }}
    />
  ),
};

