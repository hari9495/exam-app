import type { Meta, StoryObj } from '@storybook/react-vite';
import { StandbyPhone, StandbyScreen } from './roster';

const meta: Meta<typeof StandbyScreen> = { title: 'Screens/Time/TIM-38 · Standby and call-out', component: StandbyScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof StandbyScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Manager: S = { name: 'Standby slots and call-out log' };
export const Moved: S = { name: 'After the shift is moved', args: { moved: true } };
export const LogCallOut: S = { name: 'Log call-out · rest check', args: { dialog: true } };
export const Phone: StoryObj<typeof StandbyPhone> = { name: 'Phone · employee on standby', render: () => <StandbyPhone />, ...phone };
export const PhoneMoved: StoryObj<typeof StandbyPhone> = { name: 'Phone · after the shift is moved', render: () => <StandbyPhone moved />, ...phone };
