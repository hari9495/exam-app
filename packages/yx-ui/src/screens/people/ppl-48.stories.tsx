import type { Meta, StoryObj } from '@storybook/react-vite';
import { LifeEventsList } from './checklists';
import { LIFE_JOURNEYS, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-48 · Life events', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'HR · running checklists', render: () => <LifeEventsList rows={LIFE_JOURNEYS} today={TODAY} onOpen={() => {}} /> };
export const Empty: S = { name: '· none running', render: () => <LifeEventsList rows={[]} today={TODAY} /> };
export const Loading: S = { name: '· loading', render: () => <LifeEventsList rows={[]} today={TODAY} state="loading" /> };
export const LoadError: S = { name: '· error', render: () => <LifeEventsList rows={[]} today={TODAY} state="error" onRetry={() => {}} /> };
