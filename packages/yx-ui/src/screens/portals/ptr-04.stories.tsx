import type { Meta, StoryObj } from '@storybook/react-vite';
import * as P from './partner';
import { CAL_ITEMS, PARTNER, PARTNER_CLIENTS, PARTNER_COMMISSION, PARTNER_REQUESTS, PARTNER_TASKS, PARTNER_TEAM, PARTNER_TEMPLATES } from './partner-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Partner portal/PTR-04 · Requests', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const Requests: S = { render: () => <P.PartnerRequestsScreen partner={PARTNER} requests={PARTNER_REQUESTS} today={TODAY} /> };
export const NewRequest: S = { name: 'New document request', render: () => <P.PartnerRequestsScreen partner={PARTNER} requests={PARTNER_REQUESTS} today={TODAY} composeOpen /> };
export const Empty: S = { render: () => <P.PartnerRequestsScreen partner={PARTNER} requests={[]} today={TODAY} /> };
