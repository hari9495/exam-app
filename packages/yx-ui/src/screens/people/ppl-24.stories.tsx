import type { Meta, StoryObj } from '@storybook/react-vite';
import { AbscondingTimeline } from './exits';
import { d, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-24 · Absconding timeline', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Running: S = { name: 'Running (day 9, notice 1 sent)', render: () => <AbscondingTimeline today={TODAY} /> };
export const StopDialog: S = { name: 'Stop with reason', render: () => <AbscondingTimeline today={TODAY} stopOpen /> };
export const Stopped: S = { name: 'Stopped (returned)', render: () => <AbscondingTimeline today={TODAY} stopped /> };
export const Deemed: S = { name: 'Deemed abandonment (day 23)', render: () => <AbscondingTimeline today={d(2026, 10, 13)} /> };
