import type { Meta, StoryObj } from '@storybook/react-vite';
import { SamePersonQueue } from './relations';
import { MATCHES } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-36 · Possible same person', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Queue: S = { name: 'HR · proposals (name-only match never listed)', render: () => <SamePersonQueue rows={MATCHES} /> };
export const Compare: S = { name: 'Evidence side by side', render: () => <SamePersonQueue rows={MATCHES} defaultOpenId="mt1" /> };
export const FaceMatch: S = { name: 'Consented face match proposal', render: () => <SamePersonQueue rows={MATCHES} defaultOpenId="mt2" /> };
export const Empty: S = { name: '· empty', render: () => <SamePersonQueue rows={[]} /> };
