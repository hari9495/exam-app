import type { Meta, StoryObj } from '@storybook/react-vite';
import { UpcomingExits } from './upcoming';
import { TODAY, UPCOMING_EXITS } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-49 · Retirements and contract ends', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'HR · coming exits', render: () => <UpcomingExits rows={UPCOMING_EXITS} today={TODAY} onSet={() => {}} onExtend={() => {}} onConvert={() => {}} /> };
export const ViewOnly: S = { name: 'HR · view only (no change key)', render: () => <UpcomingExits rows={UPCOMING_EXITS} today={TODAY} /> };
export const Empty: S = { name: '· nothing coming', render: () => <UpcomingExits rows={[]} today={TODAY} onSet={() => {}} /> };
export const Loading: S = { name: '· loading', render: () => <UpcomingExits rows={[]} today={TODAY} state="loading" /> };
export const LoadError: S = { name: '· error', render: () => <UpcomingExits rows={[]} today={TODAY} state="error" onRetry={() => {}} /> };
