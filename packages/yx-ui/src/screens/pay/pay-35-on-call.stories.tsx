import type { Meta, StoryObj } from '@storybook/react-vite';
import { OnCallRulesScreen } from './special-pay';

const meta: Meta<typeof OnCallRulesScreen> = { title: 'Screens/Pay/PAY-35 · On-call and standby rules', component: OnCallRulesScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof OnCallRulesScreen>;

export const Weekday: S = { name: 'Rules · weekday worked example' };
export const Holiday: S = { name: 'Holiday multiplier example', args: { variant: 'holiday' } };
export const Empty: S = { name: 'Empty · no slot types in the roster', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
