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

// Answer 401: an open People joiner batch on the joining day and the location's legal entity is offered on the Template step.
export const JoinerBatch: S = { name: 'Template step · join a People batch (401)', render: () => <BulkOfferScreen rows={BULK_OFFERS} band={BAND} defaultStep="template" /> };
// Answer 405: the batch sends in the background; the page shows how far it is.
export const Running: S = {
  name: 'Sending in the background (405)',
  render: () => (
    <BulkOfferScreen
      live={{
        state: 'ready',
        onRetry: () => {},
        now: new Date(2026, 10, 9),
        setup: null,
        onSend: async () => {},
        onOpenOffer: () => {},
        batch: {
          id: 'b1', status: 'running', job: { id: 'j1', title: 'Graduate Engineer Trainee' }, startDate: '2027-07-05', expiresAt: '2026-11-16', canSeePay: true,
          progress: { done: 2, total: 5 }, joinerBatch: { id: 'jb1', name: 'GET 2027 · 5 Jul batch' },
          rows: [
            { entryId: 'e1', name: 'Aditi Rao', annualCtc: 650000, status: 'sent', offerId: 'o1', reason: null, offerStatus: 'sent', esign: true, band: 'Within range' },
            { entryId: 'e2', name: 'Farhan Sheikh', annualCtc: 720000, status: 'pending_approval', offerId: 'o2', reason: null, offerStatus: 'pending_approval', esign: true, band: 'Out of range' },
            { entryId: 'e3', name: 'Gauri Patil', annualCtc: 650000, status: 'draft', offerId: null, reason: null, offerStatus: null, esign: false, band: 'Within range' },
            { entryId: 'e4', name: 'Harish Kumar', annualCtc: 650000, status: 'draft', offerId: null, reason: null, offerStatus: null, esign: false, band: 'Within range' },
            { entryId: 'e5', name: 'Isha Menon', annualCtc: 650000, status: 'draft', offerId: null, reason: null, offerStatus: null, esign: false, band: 'Within range' },
          ],
        },
      }}
    />
  ),
};
