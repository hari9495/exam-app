import type { Meta, StoryObj } from '@storybook/react-vite';
import { ShiftEditorScreen } from './roster';

const meta: Meta<typeof ShiftEditorScreen> = { title: 'Screens/Time/TIM-06 · Shift editor and patterns', component: ShiftEditorScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ShiftEditorScreen>;

export const Fixed: S = { name: 'Fixed shift · preview' };
export const Flexi: S = { name: 'Flexi with core hours', args: { kind: 'flexi' } };
export const Split: S = { name: 'Split shift', args: { kind: 'split' } };
export const Night: S = { name: 'Night shift · law notice', args: { kind: 'night' } };
export const Patterns: S = { name: 'Patterns · N-day cycle', args: { tab: 'patterns' } };
export const SaveError: S = { name: 'Save error', args: { saveState: 'error' } };
export const Saved: S = { name: 'Saved (effective dated)', args: { saveState: 'saved' } };
