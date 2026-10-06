import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrefillPhone, PrefillScreen } from './ops';

const meta: Meta<typeof PrefillScreen> = { title: 'Screens/Time/TIM-43 · Timesheet pre-fill from my tools', component: PrefillScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PrefillScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Suggestions: S = { name: 'Suggestions · rule and AI' };
export const Connect: S = { name: 'Connect tools', args: { view: 'connect' } };
export const None: S = { name: 'No suggestions', args: { view: 'none' } };
export const Phone: StoryObj<typeof PrefillPhone> = { name: 'Phone', render: () => <PrefillPhone />, ...phone };
