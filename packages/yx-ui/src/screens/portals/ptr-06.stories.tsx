import type { Meta, StoryObj } from '@storybook/react-vite';
import * as P from './partner';
import { CAL_ITEMS, PARTNER, PARTNER_CLIENTS, PARTNER_COMMISSION, PARTNER_REQUESTS, PARTNER_TASKS, PARTNER_TEAM, PARTNER_TEMPLATES } from './partner-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Partner portal/PTR-06 · Team', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const Team: S = { name: 'Team and MFA policy', render: () => <P.PartnerTeamScreen partner={PARTNER} team={PARTNER_TEAM} /> };
export const Invite: S = { name: 'Invite user', render: () => <P.PartnerTeamScreen partner={PARTNER} team={PARTNER_TEAM} inviteOpen /> };
