import type { Meta, StoryObj } from '@storybook/react-vite';
import * as P from './partner';
import { CAL_ITEMS, PARTNER, PARTNER_CLIENTS, PARTNER_COMMISSION, PARTNER_REQUESTS, PARTNER_TASKS, PARTNER_TEAM, PARTNER_TEMPLATES } from './partner-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Partner portal/PTR-05 · Templates', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const Templates: S = { render: () => <P.PartnerTemplatesScreen partner={PARTNER} templates={PARTNER_TEMPLATES} clients={PARTNER_CLIENTS} /> };
export const CopyIntoClient: S = { name: 'Copy into client', render: () => <P.PartnerTemplatesScreen partner={PARTNER} templates={PARTNER_TEMPLATES} clients={PARTNER_CLIENTS} copyOpen /> };
