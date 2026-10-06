import type { Meta, StoryObj } from '@storybook/react-vite';
import * as P from './partner';
import { CAL_ITEMS, PARTNER, PARTNER_CLIENTS, PARTNER_COMMISSION, PARTNER_REQUESTS, PARTNER_TASKS, PARTNER_TEAM, PARTNER_TEMPLATES } from './partner-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Partner portal/PTR-01 · Clients', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const SignIn: S = { name: 'Partner sign-in (passkey, SSO or password)', render: () => <P.PartnerSignInScreen partner={PARTNER} /> };
export const SignInMfa: S = { name: 'Partner sign-in · MFA code', render: () => <P.PartnerSignInScreen partner={PARTNER} stage="mfa" /> };
export const SignInSsoRequired: S = { name: 'Partner sign-in · SSO required (10+ users)', render: () => <P.PartnerSignInScreen partner={PARTNER} stage="sso-required" /> };
export const Clients: S = { render: () => <P.PartnerClientsScreen partner={PARTNER} clients={PARTNER_CLIENTS} today={TODAY} /> };
export const ClientsPhone: S = { name: 'Clients · phone', globals: phone, render: () => <P.PartnerClientsScreen partner={PARTNER} clients={PARTNER_CLIENTS} today={TODAY} /> };
export const Create: S = { name: 'Create client tenant', render: () => <P.PartnerClientsScreen partner={PARTNER} clients={PARTNER_CLIENTS} today={TODAY} dialog="create" /> };
export const RequestLink: S = { name: 'Request a link', render: () => <P.PartnerClientsScreen partner={PARTNER} clients={PARTNER_CLIENTS} today={TODAY} dialog="link" /> };
export const Transfer: S = { name: 'Transfer partner-owned tenant to client', render: () => <P.PartnerClientsScreen partner={PARTNER} clients={PARTNER_CLIENTS} today={TODAY} dialog="transfer" /> };
export const NotVerified: S = { name: 'Firm not verified · links blocked', render: () => <P.PartnerClientsScreen partner={{ ...PARTNER, verification: 'pending' }} clients={PARTNER_CLIENTS.slice(0, 2)} today={TODAY} /> };
export const Suspended: S = { name: 'Firm suspended', render: () => <P.PartnerClientsScreen partner={{ ...PARTNER, verification: 'suspended' }} clients={PARTNER_CLIENTS} today={TODAY} /> };
export const Empty: S = { name: 'No clients yet', render: () => <P.PartnerClientsScreen partner={PARTNER} clients={[]} today={TODAY} /> };
export const Loading: S = { render: () => <P.PartnerClientsScreen partner={PARTNER} clients={PARTNER_CLIENTS} today={TODAY} state="loading" /> };
export const LoadError: S = { name: 'Error', render: () => <P.PartnerClientsScreen partner={PARTNER} clients={PARTNER_CLIENTS} today={TODAY} state="error" /> };
