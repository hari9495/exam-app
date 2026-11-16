import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExpensesHomeScreen, TeamClaimsScreen } from './expenses';
import { MY_CLAIMS, TO_PAY } from './expenses-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Expenses/EXP-01 · Expenses home', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const base = { claims: MY_CLAIMS, toPay: TO_PAY, today: TODAY };

export const Employee: S = { name: 'Employee (my claims)', render: () => <ExpensesHomeScreen {...base} /> };
// Keka ideas (2026-11): expenses saved first, claimed later.
export const EmployeeSaved: S = { name: 'Employee · expenses to be claimed', render: () => <ExpensesHomeScreen {...base} saved /> };
export const Manager: S = { name: 'Manager (waiting for me)', render: () => <ExpensesHomeScreen {...base} persona="mgr" /> };
export const Finance: S = { name: 'Finance (to pay)', render: () => <ExpensesHomeScreen {...base} persona="fin" /> };
export const Empty: S = { name: 'Empty (first use)', render: () => <ExpensesHomeScreen {...base} claims={[]} state="empty" /> };
export const Loading: S = { render: () => <ExpensesHomeScreen {...base} state="loading" /> };
export const Error: S = { render: () => <ExpensesHomeScreen {...base} state="error" /> };
export const Phone: S = { name: 'Employee · phone (camera first)', globals: PHONE, render: () => <ExpensesHomeScreen {...base} device="phone" /> };
export const NewClaim: S = { name: 'New claim · name it first', render: () => <ExpensesHomeScreen {...base} naming /> };
export const ManyRoles: S = { name: 'Employee who also approves and pays (view switch)', render: () => <ExpensesHomeScreen {...base} persona="mgr" views /> };
// Round 2 (founder answer 1): the manager's cards drill into a read-only list of the team's claims.
const T = { today: '2026-09-29' };
export const Team: S = { name: 'Team claims · manager, read only', render: () => <TeamClaimsScreen {...T} /> };
export const TeamOverLimit: S = { name: 'Team claims · with over-limit lines', render: () => <TeamClaimsScreen {...T} over /> };
export const TeamEmpty: S = { name: 'Team claims · nothing sent yet', render: () => <TeamClaimsScreen {...T} state="empty" /> };
export const TeamNoAccess: S = { name: 'Team claims · not a manager (no access)', render: () => <TeamClaimsScreen {...T} state="no-access" /> };
export const TeamPhone: S = { name: 'Team claims · phone', globals: PHONE, render: () => <TeamClaimsScreen {...T} /> };
