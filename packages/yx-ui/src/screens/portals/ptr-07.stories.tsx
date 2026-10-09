import type { Meta, StoryObj } from '@storybook/react-vite';
import * as P from './partner';
import { CAL_ITEMS, PARTNER, PARTNER_CLIENTS, PARTNER_COMMISSION, PARTNER_REQUESTS, PARTNER_TASKS, PARTNER_TEAM, PARTNER_TEMPLATES } from './partner-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Partner portal/PTR-07 · Billing and commission', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const Billing: S = { render: () => <P.PartnerBillingScreen partner={PARTNER} clients={PARTNER_CLIENTS} commission={PARTNER_COMMISSION} /> };
export const Phone: S = { name: 'Billing · phone', globals: phone, render: () => <P.PartnerBillingScreen partner={PARTNER} clients={PARTNER_CLIENTS} commission={PARTNER_COMMISSION} /> };
