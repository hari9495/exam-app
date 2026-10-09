import type { Meta, StoryObj } from '@storybook/react-vite';
import * as P from './partner';
import { CAL_ITEMS, PARTNER, PARTNER_CLIENTS, PARTNER_COMMISSION, PARTNER_REQUESTS, PARTNER_TASKS, PARTNER_TEAM, PARTNER_TEMPLATES } from './partner-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Partner portal/PTR-03 · Tasks board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const Board: S = { render: () => <P.PartnerTasksScreen partner={PARTNER} tasks={PARTNER_TASKS} /> };
export const Phone: S = { name: 'Board · phone', globals: phone, render: () => <P.PartnerTasksScreen partner={PARTNER} tasks={PARTNER_TASKS} /> };
export const Empty: S = { render: () => <P.PartnerTasksScreen partner={PARTNER} tasks={[]} /> };
