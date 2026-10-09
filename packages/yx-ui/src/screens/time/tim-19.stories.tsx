import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveRequestDetail } from './leave';

const meta: Meta<typeof LeaveRequestDetail> = { title: 'Screens/Time/TIM-19 · Leave request detail', component: LeaveRequestDetail, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeaveRequestDetail>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Pending: S = { name: 'Employee · pending' };
export const Withdraw: S = { name: 'Withdraw', args: { action: 'withdraw' } };
export const Approved: S = { name: 'Employee · approved', args: { id: 'lr2' } };
export const Cancel: S = { name: 'Past approved leave · report an error', args: { id: 'lr2', action: 'report' } };
export const AskCancel: S = { name: 'Employee · ask to cancel future leave', args: { id: 'lr6', action: 'cancel' } };
export const Manager: S = { name: 'Manager · with team availability', args: { id: 'lr3', persona: 'mgr' } };
export const Approve: S = { name: 'Manager · approve', args: { id: 'lr4', persona: 'mgr', action: 'approve' } };
export const Phone: S = { name: 'Phone', args: { surface: 'phone' }, ...phone };
export const PhoneManager: S = { name: 'Phone · manager', args: { surface: 'phone', id: 'lr3', persona: 'mgr' }, ...phone };
