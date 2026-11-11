import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatutoryHubScreen } from './compliance';
import { HUB_ITEMS } from './compliance-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Compliance/CMP-01 · Statutory hub', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Cards: S = { name: 'Cards per statute (overdue with penalty)', render: () => <StatutoryHubScreen items={HUB_ITEMS} today={TODAY} /> };
export const Calendar: S = { name: 'Due-date calendar', render: () => <StatutoryHubScreen items={HUB_ITEMS} today={TODAY} view="calendar" /> };
export const AllOnTrack: S = { name: 'All on track', render: () => <StatutoryHubScreen items={HUB_ITEMS.filter((i) => i.id !== 'lwf-ka')} today={TODAY} /> };
export const SetupNeeded: S = { name: 'Empty (set-up needed)', render: () => <StatutoryHubScreen items={[]} today={TODAY} setupNeeded /> };
// Answer 842: a filed PF return with the bank's challan receipt kept.
export const BankReceipt: S = { name: 'Filed · bank challan receipt kept (842)', render: () => <StatutoryHubScreen items={HUB_ITEMS.map((i) => (i.statute === 'PF' && i.step === 'filed' ? { ...i, receipt: true } : i))} today={TODAY} /> };
export const Loading: S = { render: () => <StatutoryHubScreen items={HUB_ITEMS} today={TODAY} state="loading" /> };
