import type { Meta, StoryObj } from '@storybook/react-vite';
import { BuddyPanel } from './onboarding';
import { BUDDIES } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-41 · Buddy panel', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Hr: S = { name: 'HR · pool, load and check-ins', render: () => <BuddyPanel pool={BUDDIES} /> };
export const Assign: S = { name: 'HR · assign a buddy to a joiner', render: () => <BuddyPanel pool={BUDDIES} assignFor="k3" /> };
export const Empty: S = { name: '· empty pool', render: () => <BuddyPanel pool={[]} needs={[]} /> };
