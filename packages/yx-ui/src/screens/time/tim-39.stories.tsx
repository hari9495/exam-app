import type { Meta, StoryObj } from '@storybook/react-vite';
import { BlockLeavePlannerScreen } from './roster';

const meta: Meta<typeof BlockLeavePlannerScreen> = { title: 'Screens/Time/TIM-39 · Block-leave planner', component: BlockLeavePlannerScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof BlockLeavePlannerScreen>;

export const Hr: S = { name: 'HR · compliance view' };
export const Manager: S = { name: 'Manager', args: { persona: 'mgr' } };
export const Suspend: S = { name: 'Access suspension confirmation', args: { confirm: true } };
