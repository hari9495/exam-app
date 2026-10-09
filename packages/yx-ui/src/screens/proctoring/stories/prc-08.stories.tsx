import type { Meta, StoryObj } from '@storybook/react-vite';
import { SlotCalendarScreen } from '../delivery';
import { SLOTS } from '../proctoring-data';

const meta: Meta<typeof SlotCalendarScreen> = { title: 'Screens/Proctoring/PRC-08 · Slot calendar', component: SlotCalendarScreen, parameters: { layout: 'fullscreen' }, args: { slots: SLOTS } };
export default meta;
type S = StoryObj<typeof SlotCalendarScreen>;

export const Default: S = { name: 'Centre slot selected' };
export const FullSlot: S = { name: 'Full slot', args: { defaultSlot: 's1' } };
export const ShortOfProctors: S = { name: 'Short of proctors', args: { defaultSlot: 's3', slots: SLOTS.map((s) => (s.id === 's3' ? { ...s, proctors: 3 } : s)) } };
export const Empty: S = { name: 'Empty week', args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };
export const Error: S = { args: { state: 'error' } };
