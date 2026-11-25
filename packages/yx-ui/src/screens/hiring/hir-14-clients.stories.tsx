import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClientsScreen, ClientWorkspaceScreen } from './hiring-staffing';
import { CLIENTS, CLIENT_CONTACTS } from './hiring-data';
import { ClientSheet, ContactSheet } from './staffing-sheets';

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
// Drawn for the live pages (staffing slice 1): add or change a client, add a contact, and the desk turned off.
const STATES = [{ value: 'IN-TN', label: 'Tamil Nadu' }, { value: 'IN-KA', label: 'Karnataka' }];
const PEOPLE = [{ value: 'u1', label: 'Anita Kurian' }, { value: 'u2', label: 'Vikram Singh' }];
export const AddClient: S = {
  name: 'Add client',
  render: () => (
    <>
      <ClientsScreen rows={CLIENTS} />
      <ClientSheet open onOpenChange={() => {}} initial={null} states={STATES} people={PEOPLE} defaultTermsDays={30} onSave={async () => {}} />
    </>
  ),
};
export const AddContact: S = {
  name: 'Client workspace · add contact',
  render: () => (
    <>
      <ClientWorkspaceScreen client={CLIENTS[0]} contacts={CLIENT_CONTACTS} defaultTab="contacts" />
      <ContactSheet open onOpenChange={() => {}} initial={null} onSave={async () => {}} />
    </>
  ),
};
export const DeskOff: S = { name: 'Staffing desk turned off', render: () => <ClientsScreen live={{ state: 'off', onRetry: () => {}, rows: [], canManage: false, onAdd: () => {}, onOpen: () => {} }} /> };
