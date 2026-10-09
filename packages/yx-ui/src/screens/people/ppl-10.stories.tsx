import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContinuityChecklistPanel } from './changes';
import { d } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-10 · Inter-entity continuity checklist', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Open: S = { name: 'Items open (payroll pre-flight)', render: () => <ContinuityChecklistPanel today={d(2026, 10, 12)} /> };
export const Done: S = { name: 'All items done', render: () => <ContinuityChecklistPanel today={d(2026, 10, 25)} allDone /> };
