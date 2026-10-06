import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeathInServiceFlow } from './exits';

const meta: Meta = { title: 'Screens/People/PPL-23 · Death in service', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Payees: S = { name: 'Payees per nominations', render: () => <DeathInServiceFlow /> };
export const LegalHeirs: S = { name: 'No valid nomination (legal heirs)', render: () => <DeathInServiceFlow noNomination /> };
export const Dues: S = { name: 'Dues split by share', render: () => <DeathInServiceFlow current="dues" /> };
export const Forms: S = { name: 'Claim forms checklist', render: () => <DeathInServiceFlow current="forms" /> };
export const Letters: S = { name: 'Letters and nominee access', render: () => <DeathInServiceFlow current="letters" /> };
