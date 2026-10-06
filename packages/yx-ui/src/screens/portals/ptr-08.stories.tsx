import type { Meta, StoryObj } from '@storybook/react-vite';
import * as P from './partner';
import { CAL_ITEMS, PARTNER, PARTNER_CLIENTS, PARTNER_COMMISSION, PARTNER_REQUESTS, PARTNER_TASKS, PARTNER_TEAM, PARTNER_TEMPLATES } from './partner-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Partner portal/PTR-08 · Profile', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const Profile: S = { render: () => <P.PartnerProfileScreen partner={PARTNER} /> };
export const AgreementOutdated: S = { name: 'New G-34 version to accept', render: () => <P.PartnerProfileScreen partner={{ ...PARTNER, agreementCurrent: false }} /> };
export const Pending: S = { name: 'Verification pending', render: () => <P.PartnerProfileScreen partner={{ ...PARTNER, verification: 'pending' }} /> };
