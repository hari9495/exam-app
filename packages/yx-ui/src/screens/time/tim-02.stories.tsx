import type { Meta, StoryObj } from '@storybook/react-vite';
import { MusterScreen } from './attendance';

const meta: Meta<typeof MusterScreen> = { title: 'Screens/Time/TIM-02 · Muster', component: MusterScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MusterScreen>;

export const Open: S = { name: 'Open month' };
export const CellOpen: S = { name: 'Cell → day card', args: { openCell: ['t8', 27] } };
export const Freeze: S = { name: 'Freeze inputs', args: { dialog: 'freeze' } };
export const Frozen: S = { name: 'Frozen · all exceptions resolved', args: { stage: 'frozen', resolved: true } };
export const FrozenBlocked: S = { name: 'Frozen · lock blocked by open exceptions', args: { stage: 'frozen' } };
// September's cut-off (30 Sep) hasn't passed on 29 Sep, so the lock stories use August, which has ended.
export const Lock: S = {
  name: 'Lock · typed confirmation (August)',
  args: { month: 'aug', stage: 'frozen', dialog: 'lock', asOf: new Date(2026, 8, 2) },
  parameters: { docs: { description: { story: 'The moment August was locked (2 Sep, before payroll was approved on 3 Sep). The Locked story shows the same month afterwards.' } } },
};
export const Locked: S = { name: 'Locked (August)', args: { month: 'aug', stage: 'locked' } };
export const Bulk: S = { name: 'Bulk mark present with reason', args: { dialog: 'bulk', defaultSelected: ['t3', 't5', 't10'] } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
