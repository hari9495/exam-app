import type { Meta, StoryObj } from '@storybook/react-vite';
import { CollectionsScreen } from './hiring-staffing';
import { LEDGER } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-19 · Receivables and collections', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Ageing: S = { name: 'Finance · ageing, TDS and disputes', render: () => <CollectionsScreen rows={LEDGER} today={TODAY} /> };
export const Receipt: S = { name: 'Record part payment', render: () => <CollectionsScreen rows={LEDGER} today={TODAY} receiptOpen /> };
export const Empty: S = { name: 'Empty · nothing outstanding', render: () => <CollectionsScreen rows={[]} today={TODAY} /> };
export const Loading: S = { name: 'Loading', render: () => <CollectionsScreen rows={[]} today={TODAY} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <CollectionsScreen rows={[]} today={TODAY} state="error" /> };
