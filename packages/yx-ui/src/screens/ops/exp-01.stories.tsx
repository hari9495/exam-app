import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExpensesHomeScreen } from './expenses';
import { MY_CLAIMS, TO_PAY } from './expenses-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Expenses/EXP-01 · Expenses home', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const base = { claims: MY_CLAIMS, toPay: TO_PAY, today: TODAY };

export const Employee: S = { name: 'Employee (my claims)', render: () => <ExpensesHomeScreen {...base} /> };
export const Manager: S = { name: 'Manager (waiting for me)', render: () => <ExpensesHomeScreen {...base} persona="mgr" /> };
export const Finance: S = { name: 'Finance (to pay)', render: () => <ExpensesHomeScreen {...base} persona="fin" /> };
export const Empty: S = { name: 'Empty (first use)', render: () => <ExpensesHomeScreen {...base} claims={[]} state="empty" /> };
export const Loading: S = { render: () => <ExpensesHomeScreen {...base} state="loading" /> };
export const Error: S = { render: () => <ExpensesHomeScreen {...base} state="error" /> };
export const Phone: S = { name: 'Employee · phone (camera first)', globals: PHONE, render: () => <ExpensesHomeScreen {...base} device="phone" /> };
