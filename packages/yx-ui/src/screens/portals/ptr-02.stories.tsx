import type { Meta, StoryObj } from '@storybook/react-vite';
import * as P from './partner';
import { CAL_ITEMS, PARTNER, PARTNER_CLIENTS, PARTNER_COMMISSION, PARTNER_REQUESTS, PARTNER_TASKS, PARTNER_TEAM, PARTNER_TEMPLATES } from './partner-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Partner portal/PTR-02 · Cross-client compliance calendar', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const Month: S = { name: 'Month view', render: () => <P.ComplianceCalendarScreen partner={PARTNER} items={CAL_ITEMS} today={TODAY} /> };
export const List: S = { name: 'List view', render: () => <P.ComplianceCalendarScreen partner={PARTNER} items={CAL_ITEMS} today={TODAY} view="list" /> };
export const Phone: S = { name: 'List · phone', globals: phone, render: () => <P.ComplianceCalendarScreen partner={PARTNER} items={CAL_ITEMS} today={TODAY} view="list" /> };
export const Empty: S = { name: 'Filtered to nothing', render: () => <P.ComplianceCalendarScreen partner={PARTNER} items={[]} today={TODAY} /> };
