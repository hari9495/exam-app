import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClientsScreen, ClientWorkspaceScreen } from './hiring-staffing';
import { CLIENTS, CLIENT_CONTACTS } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-14 · Clients', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'Account manager · clients list', render: () => <ClientsScreen rows={CLIENTS} /> };
export const Workspace: S = { name: 'Client workspace · overview', render: () => <ClientWorkspaceScreen client={CLIENTS[0]} contacts={CLIENT_CONTACTS} /> };
export const Contacts: S = { name: 'Client workspace · contacts and portal access', render: () => <ClientWorkspaceScreen client={CLIENTS[0]} contacts={CLIENT_CONTACTS} defaultTab="contacts" /> };
export const Contracts: S = { name: 'Client workspace · contracts', render: () => <ClientWorkspaceScreen client={CLIENTS[0]} contacts={CLIENT_CONTACTS} defaultTab="contracts" /> };
export const Slas: S = { name: 'Client workspace · SLAs', render: () => <ClientWorkspaceScreen client={CLIENTS[0]} contacts={CLIENT_CONTACTS} defaultTab="slas" /> };
export const Empty: S = { name: 'Empty', render: () => <ClientsScreen rows={[]} /> };
export const Loading: S = { name: 'Loading', render: () => <ClientsScreen rows={[]} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <ClientsScreen rows={[]} state="error" /> };
