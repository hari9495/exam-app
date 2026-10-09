import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveHomePhone, LeaveHomeScreen } from './leave';

const meta: Meta<typeof LeaveHomeScreen> = { title: 'Screens/Time/TIM-17 · Leave home', component: LeaveHomeScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeaveHomeScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Employee: S = { name: 'Employee' };
export const Manager: S = { name: 'Manager', args: { persona: 'mgr' } };
export const Hr: S = { name: 'HR', args: { persona: 'hr' } };
export const Empty: S = { name: 'Employee · no requests yet', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
export const Phone: StoryObj<typeof LeaveHomePhone> = { name: 'Phone · employee', render: () => <LeaveHomePhone />, ...phone };
export const PhoneManager: StoryObj<typeof LeaveHomePhone> = { name: 'Phone · manager', render: () => <LeaveHomePhone persona="mgr" />, ...phone };
