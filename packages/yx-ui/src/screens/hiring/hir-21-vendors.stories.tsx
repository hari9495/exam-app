import type { Meta, StoryObj } from '@storybook/react-vite';
import { VendorsScreen } from './hiring-staffing';
import { PRIOR_SUBMISSIONS, VENDORS, VENDOR_SUBMISSIONS } from './hiring-data';
import { TODAY } from '../_kit/data';

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
