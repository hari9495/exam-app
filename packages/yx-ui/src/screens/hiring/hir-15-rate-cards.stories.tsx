import type { Meta, StoryObj } from '@storybook/react-vite';
import { RateCardScreen } from './hiring-staffing';
import { RATE_CARD } from './hiring-data';
import { RateLineSheet } from './staffing-sheets';

const meta: Meta = { title: 'Screens/Hiring/HIR-15 · Rate cards', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const client = 'Nilgiri Retail Pvt Ltd';
export const Current: S = { name: 'Account manager · current rates with margin', render: () => <RateCardScreen client={client} rows={RATE_CARD} /> };
export const History: S = { name: 'Dated history shown', render: () => <RateCardScreen client={client} rows={RATE_CARD} showHistory /> };
export const ChangeRate: S = { name: 'Dated rate change', render: () => <RateCardScreen client={client} rows={RATE_CARD} editOpen /> };
export const Recruiter: S = { name: 'Recruiter · no pay rates or margins', render: () => <RateCardScreen client={client} rows={RATE_CARD} persona="recruiter" /> };
export const Empty: S = { name: 'Empty', render: () => <RateCardScreen client="Tungabhadra Motors" rows={[]} /> };
// Drawn for the live page (staffing slice 1): add a role to the card, with the company's multipliers as defaults.
export const AddRole: S = {
  name: 'Add role',
  render: () => (
    <>
      <RateCardScreen client={client} rows={RATE_CARD} />
      <RateLineSheet open onOpenChange={() => {}} defaults={{ ot: '1.5', holiday: '2', today: new Date(2026, 10, 14) }} onSave={async () => {}} />
    </>
  ),
};
