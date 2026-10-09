import type { Meta, StoryObj } from '@storybook/react-vite';
import { OffCycleRunScreen } from './offcycle';

const meta: Meta<typeof OffCycleRunScreen> = { title: 'Screens/Pay/PAY-11 · Off-cycle run', component: OffCycleRunScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof OffCycleRunScreen>;

export const Fnf: S = { name: 'F&F · 2-working-day deadline' };
export const Retrenchment: S = { name: 'F&F retrenchment · blocked without permission', args: { kind: 'retrenchment' } };
export const RetrenchmentOk: S = { name: 'F&F retrenchment · permission recorded', args: { kind: 'retrenchment', permission: true } };
export const Death: S = { name: 'F&F on death in service · nominee shares', args: { kind: 'death' } };
export const Bonus: S = { name: 'Bonus run', args: { kind: 'bonus' } };
export const ChooseType: S = { name: 'Choose run type (arrears only, correction)', args: { kind: 'correction', step: 'type' } };
