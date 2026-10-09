import type { Meta, StoryObj } from '@storybook/react-vite';
import { TipsPoolScreen } from './special-pay';

const meta: Meta<typeof TipsPoolScreen> = { title: 'Screens/Pay/PAY-34 · Tips pool', component: TipsPoolScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TipsPoolScreen>;

export const Pools: S = { name: 'Pools by outlet and period' };
export const Points: S = { name: 'Pool · split by points', args: { openId: 't1' } };
export const Hours: S = { name: 'Pool · split by hours', args: { openId: 't2' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
