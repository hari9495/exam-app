import type { Meta, StoryObj } from '@storybook/react-vite';
import { ModerationScreen } from './engage-feed';
import { MOD_ITEMS } from './engage-data';
import { liveModeration } from './engage-live-samples';

const meta: Meta = { title: 'Screens/Engage/ENG-11 · Moderation queue', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Queue: S = { name: 'Queue', render: () => <ModerationScreen items={MOD_ITEMS} /> };
export const Review: S = { name: 'Review item (repeat pattern)', render: () => <ModerationScreen items={MOD_ITEMS} openId="m1" /> };
export const Delete: S = { name: 'Delete confirmation', render: () => <ModerationScreen items={MOD_ITEMS} openId="m2" deleteOpen /> };
export const Empty: S = { render: () => <ModerationScreen items={[]} /> };
export const Loading: S = { render: () => <ModerationScreen items={[]} state="loading" /> };
// Batch G2 item 100: the company's queue (held, waiting for approval, hidden after reports).
export const CompanyQueue: S = { name: 'Queue · held, waiting and hidden', render: () => <ModerationScreen live={liveModeration()} /> };
export const CompanyQueueOpen: S = { name: 'Queue · repeat author opened', render: () => <ModerationScreen live={liveModeration({ start: { open: 'm1' } })} /> };
export const CompanyQueueEmpty: S = { name: 'Queue · nothing to review', render: () => <ModerationScreen live={liveModeration({ items: [] })} /> };
export const NoAccess: S = { name: 'No access (without engage.moderate)', render: () => <ModerationScreen live={liveModeration({ state: 'no-access' })} /> };
