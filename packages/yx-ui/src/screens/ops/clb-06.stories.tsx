import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClientEstablishmentsScreen } from './contract';
import { CLIENTS } from './contract-data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-06 · Client establishments', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { render: () => <ClientEstablishmentsScreen clients={CLIENTS} /> };
export const AtMaximum: S = { name: 'Site at licence maximum', render: () => <ClientEstablishmentsScreen clients={CLIENTS} openId="cl1" /> };
export const NotCovered: S = { name: 'Site not covered by any licence', render: () => <ClientEstablishmentsScreen clients={CLIENTS} openId="cl3" /> };
export const Empty: S = { render: () => <ClientEstablishmentsScreen clients={[]} state="empty" /> };
