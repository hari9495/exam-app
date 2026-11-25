import type { Meta, StoryObj } from '@storybook/react-vite';
import { MusterScreen } from './attendance';

const meta: Meta<typeof MusterScreen> = { title: 'Screens/Time/TIM-02 · Muster', component: MusterScreen, render: (args) => <MusterScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MusterScreen>;

export const Open: S = { name: 'Open month' };
export const CellOpen: S = { name: 'Cell → day card', args: { openCell: ['t8', 27] } };
export const Freeze: S = { name: 'Freeze inputs', args: { dialog: 'freeze' } };
export const Frozen: S = { name: 'Frozen · all exceptions resolved', args: { stage: 'frozen', resolved: true } };
export const FrozenBlocked: S = { name: 'Frozen · lock blocked by open exceptions', args: { stage: 'frozen' } };
// September's cut-off (30 Sep) hasn't passed on 29 Sep, so the lock stories use August, which has ended.
export const Lock: S = {
  name: 'Lock · confirm (August)',
  args: { month: 'aug', stage: 'frozen', dialog: 'lock', asOf: new Date(2026, 8, 2) },
  parameters: { docs: { description: { story: 'The moment August was locked (2 Sep, before payroll was approved on 3 Sep). The Locked story shows the same month afterwards.' } } },
};
export const Locked: S = { name: 'Locked (August)', args: { month: 'aug', stage: 'locked' } };
export const Bulk: S = { name: 'Bulk mark present with reason', args: { dialog: 'bulk', defaultSelected: ['t3', 't5', 't10'] } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
// Founder 2 Nov 2026 (overtime pre-approval, item 1): a manager pre-approves overtime for a report from the team muster.
export const Manager: S = { name: 'Manager · team muster', args: { persona: 'mgr' } };
export const PreApprove: S = { name: 'Manager · Pre-approve overtime', args: { persona: 'mgr', preApprove: 'default' } };
export const PreApproveFilled: S = { name: 'Manager · Pre-approve overtime · filled in', args: { persona: 'mgr', preApprove: 'filled' } };
export const PreApproveErrors: S = { name: 'Manager · Pre-approve overtime · pressed too early', args: { persona: 'mgr', preApprove: 'errors' } };
export const PreApproveRefused: S = { name: 'Manager · Pre-approve overtime · refused', args: { persona: 'mgr', preApprove: 'refused' } };
// Founder 2 Nov 2026: a factory worker's overtime is paid by law, so the sheet offers only Paid overtime.
export const PreApproveFactory: S = { name: 'Manager · Pre-approve overtime · factory worker (paid only)', args: { persona: 'mgr', preApprove: 'factory' } };
