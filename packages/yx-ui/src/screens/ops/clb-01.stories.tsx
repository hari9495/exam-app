import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContractorsScreen } from './contract';
import { CONTRACTORS, ESTABLISHMENTS } from './contract-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-01 · Contractors register', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { contractors: CONTRACTORS, establishments: ESTABLISHMENTS, today: TODAY };

export const Register: S = { name: 'Register · renewal alerts', render: () => <ContractorsScreen {...base} /> };
export const Record: S = { name: 'Contractor record (licence, work order)', render: () => <ContractorsScreen {...base} openId="c2" /> };
export const Expired: S = { name: 'Expired licence record', render: () => <ContractorsScreen {...base} openId="c3" /> };
export const Empty: S = { render: () => <ContractorsScreen {...base} contractors={[]} state="empty" /> };
export const Loading: S = { render: () => <ContractorsScreen {...base} state="loading" /> };
