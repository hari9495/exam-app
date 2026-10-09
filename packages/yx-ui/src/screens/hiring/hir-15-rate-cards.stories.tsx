import type { Meta, StoryObj } from '@storybook/react-vite';
import { RateCardScreen } from './hiring-staffing';
import { RATE_CARD } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-15 · Rate cards', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const client = 'Nilgiri Retail Pvt Ltd';
export const Current: S = { name: 'Account manager · current rates with margin', render: () => <RateCardScreen client={client} rows={RATE_CARD} /> };
export const History: S = { name: 'Dated history shown', render: () => <RateCardScreen client={client} rows={RATE_CARD} showHistory /> };
export const ChangeRate: S = { name: 'Dated rate change', render: () => <RateCardScreen client={client} rows={RATE_CARD} editOpen /> };
export const Recruiter: S = { name: 'Recruiter · no pay rates or margins', render: () => <RateCardScreen client={client} rows={RATE_CARD} persona="recruiter" /> };
export const Empty: S = { name: 'Empty', render: () => <RateCardScreen client="Tungabhadra Motors" rows={[]} /> };
