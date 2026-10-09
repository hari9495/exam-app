import type { Meta, StoryObj } from '@storybook/react-vite';
import { TrainingNeedsScreen } from './learn-admin';
import { BUDGETS, NEEDS } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-11 · Training needs and budgets', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Needs: S = { name: 'L&D · needs grouped by status', render: () => <TrainingNeedsScreen persona="ld" needs={NEEDS} budgets={BUDGETS} /> };
export const Budgets: S = { name: 'Finance · budgets (one over)', render: () => <TrainingNeedsScreen persona="fin" needs={NEEDS} budgets={BUDGETS} tab="budgets" /> };
export const Empty: S = { render: () => <TrainingNeedsScreen persona="ld" needs={[]} budgets={BUDGETS} /> };
export const Loading: S = { render: () => <TrainingNeedsScreen persona="ld" needs={NEEDS} budgets={BUDGETS} state="loading" /> };
