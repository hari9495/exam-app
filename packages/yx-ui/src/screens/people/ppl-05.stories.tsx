import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScheduledChangesScreen } from './changes';
import { SCHEDULED, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-05 · Scheduled changes', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Next30: S = { name: 'Next 30 days', render: () => <ScheduledChangesScreen rows={SCHEDULED} today={TODAY} /> };
export const Next90: S = { name: 'Next 90 days (two changes for one person)', render: () => <ScheduledChangesScreen rows={SCHEDULED} today={TODAY} defaultWindow={90} /> };
export const Cancel: S = { name: 'Cancel with reason', render: () => <ScheduledChangesScreen rows={SCHEDULED} today={TODAY} defaultCancelId="s2" /> };
export const Empty: S = { name: '· empty', render: () => <ScheduledChangesScreen rows={[]} today={TODAY} /> };
