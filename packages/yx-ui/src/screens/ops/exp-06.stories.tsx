import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToPayScreen } from './expenses-finance';
import { TO_PAY } from './expenses-data';

const meta: Meta = { title: 'Screens/Expenses/EXP-06 · To-pay queue', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Unpaid: S = { render: () => <ToPayScreen claims={TO_PAY} /> };
export const BulkPayroll: S = { name: 'Bulk · add to payroll', render: () => <ToPayScreen claims={TO_PAY} defaultSelected={['EXP-1037', 'EXP-1031']} confirm="payroll" /> };
export const BulkPayout: S = { name: 'Bulk · pay now by bank file', render: () => <ToPayScreen claims={TO_PAY} defaultSelected={['EXP-1035']} confirm="payout" /> };
export const Failed: S = { name: 'Payment failed · re-route', render: () => <ToPayScreen claims={TO_PAY} view="failed" /> };
export const All: S = { name: 'All approved (with paid)', render: () => <ToPayScreen claims={TO_PAY} view="all" /> };
export const Empty: S = { render: () => <ToPayScreen claims={[]} state="empty" /> };
export const Loading: S = { render: () => <ToPayScreen claims={TO_PAY} state="loading" /> };
export const Error: S = { render: () => <ToPayScreen claims={TO_PAY} state="error" /> };
