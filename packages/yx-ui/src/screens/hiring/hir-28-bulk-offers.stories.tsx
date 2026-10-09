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
