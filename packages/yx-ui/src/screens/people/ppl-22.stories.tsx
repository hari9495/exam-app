import type { Meta, StoryObj } from '@storybook/react-vite';
import { FnfCalculator } from './exits';
import { d, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-22 · F&F calculator', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Explained lines with deadline countdown', render: () => <FnfCalculator today={TODAY} /> };
export const DueSoon: S = { name: 'One working day left (holiday skipped)', render: () => <FnfCalculator today={d(2026, 10, 21)} /> };
export const Overdue: S = { name: 'Overdue', render: () => <FnfCalculator variant="overdue" today={d(2026, 10, 24)} /> };
export const Held: S = { name: 'Part held for an open case', render: () => <FnfCalculator variant="held" today={TODAY} /> };
export const Absconding: S = { name: 'Recovery-only (absconding)', render: () => <FnfCalculator variant="absconding" today={d(2026, 10, 13)} /> };
