import type { Meta, StoryObj } from '@storybook/react-vite';
import * as P from './partner';
import { CAL_ITEMS, PARTNER, PARTNER_CLIENTS, PARTNER_COMMISSION, PARTNER_REQUESTS, PARTNER_TASKS, PARTNER_TEAM, PARTNER_TEMPLATES } from './partner-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Partner portal/PTR-09 · Client switcher and working-in banner', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const Switcher: S = { name: 'Client switcher', render: () => <P.ClientSwitcherScreen partner={PARTNER} clients={PARTNER_CLIENTS} state="switcher" /> };
export const Working: S = { name: 'Working in client (banner)', render: () => <P.ClientSwitcherScreen partner={PARTNER} clients={PARTNER_CLIENTS} state="working" /> };
export const StepUp: S = { name: 'Delegated action · step-up', render: () => <P.ClientSwitcherScreen partner={PARTNER} clients={PARTNER_CLIENTS} state="step-up" /> };
export const Ended: S = { name: 'Grant withdrawn · request refused', render: () => <P.ClientSwitcherScreen partner={PARTNER} clients={PARTNER_CLIENTS} state="ended" /> };
