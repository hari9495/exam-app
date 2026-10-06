import type { Meta, StoryObj } from '@storybook/react-vite';
import { ModerationScreen } from './engage-feed';
import { MOD_ITEMS } from './engage-data';

const meta: Meta = { title: 'Screens/Engage/ENG-11 · Moderation queue', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Queue: S = { name: 'Queue', render: () => <ModerationScreen items={MOD_ITEMS} /> };
export const Review: S = { name: 'Review item (repeat pattern)', render: () => <ModerationScreen items={MOD_ITEMS} openId="m1" /> };
export const Delete: S = { name: 'Delete confirmation', render: () => <ModerationScreen items={MOD_ITEMS} openId="m2" deleteOpen /> };
export const Empty: S = { render: () => <ModerationScreen items={[]} /> };
export const Loading: S = { render: () => <ModerationScreen items={[]} state="loading" /> };
