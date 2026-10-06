import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExceptionsPhone, ExceptionsScreen } from './attendance';

const meta: Meta<typeof ExceptionsScreen> = { title: 'Screens/Time/TIM-04 · Attendance exceptions', component: ExceptionsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ExceptionsScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Hr: S = { name: 'HR · queue' };
export const Manager: S = { name: 'Manager · team', args: { persona: 'mgr' } };
export const Resolve: S = { name: 'HR · resolve with reason', args: { resolveOpen: true } };
export const OnePerson: S = { name: 'Manager · one person (from calendar)', args: { persona: 'mgr', defaultSearch: 'Meera Krishnan' } };
export const Empty: S = { name: 'Empty · nothing open', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
export const Phone: StoryObj<typeof ExceptionsPhone> = { name: 'Phone · manager', render: () => <ExceptionsPhone />, ...phone };
