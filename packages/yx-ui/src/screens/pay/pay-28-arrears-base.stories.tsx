import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrearsBaseScreen } from './offcycle';

const meta: Meta<typeof ArrearsBaseScreen> = { title: 'Screens/Pay/PAY-28 · Arrears base confirmation', component: ArrearsBaseScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ArrearsBaseScreen>;

export const Missing: S = { name: 'Month missing · approval blocked' };
export const Confirmed: S = { name: 'Base confirmed · ready to compute', args: { confirmed: true } };
export const Computed: S = { name: 'Arrears computed · send for approval', args: { confirmed: true, computed: true } };
