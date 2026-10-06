import type { Meta, StoryObj } from '@storybook/react-vite';
import { HybridPhone, HybridPlannerScreen } from './roster';

const meta: Meta<typeof HybridPlannerScreen> = { title: 'Screens/Time/TIM-41 · Hybrid office days', component: HybridPlannerScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof HybridPlannerScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Manager: S = { name: 'Manager · team plan' };
export const Compliance: S = { name: 'Weekly compliance', args: { tab: 'compliance' } };
export const Policy: S = { name: 'HR · policy', args: { persona: 'hr', tab: 'policy' } };
export const Employee: S = { name: 'Employee', args: { persona: 'emp' } };
export const Phone: StoryObj<typeof HybridPhone> = { name: 'Phone · my office days', render: () => <HybridPhone />, ...phone };
