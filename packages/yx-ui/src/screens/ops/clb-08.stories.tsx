import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClientPacksScreen } from './contract';
import { CLIENT_PACKS } from './contract-data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-08 · Client compliance packs', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Packs: S = { name: 'Packs by client and month', render: () => <ClientPacksScreen packs={CLIENT_PACKS} /> };
export const RecordUpload: S = { name: 'Record portal upload', render: () => <ClientPacksScreen packs={CLIENT_PACKS} recordOpen /> };
export const AllAccepted: S = { name: 'All accepted', render: () => <ClientPacksScreen packs={CLIENT_PACKS.filter((p) => p.status === 'Accepted')} /> };
