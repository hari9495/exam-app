import type { Meta, StoryObj } from '@storybook/react-vite';
import { BonusComputationScreen } from './offcycle';

const meta: Meta<typeof BonusComputationScreen> = { title: 'Screens/Pay/PAY-24 · Bonus computation', component: BonusComputationScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof BonusComputationScreen>;

export const Minimum: S = { name: 'Compute at 8.33%' };
export const Higher: S = { name: 'Compute at 20%', args: { pct: 20 } };
export const Surplus: S = { name: 'Allocable surplus step', args: { step: 'surplus' } };
export const Approve: S = { name: 'Approve and pay', args: { step: 'approve' } };
