import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreboardingBatches } from './onboarding';
import { BATCHES } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-14 · Pre-boarding batches', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Campus batches', render: () => <PreboardingBatches rows={BATCHES} /> };
export const ChangeDate: S = { name: 'Change batch joining date (re-anchor)', render: () => <PreboardingBatches rows={BATCHES} defaultChangeId="b3" defaultDate={new Date(2026, 10, 2)} /> };
export const Empty: S = { name: '· empty', render: () => <PreboardingBatches rows={[]} /> };
