import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecoveriesScreen } from './payroll-inputs';

const meta: Meta<typeof RecoveriesScreen> = { title: 'Screens/Pay/PAY-19 · Court orders and recoveries', component: RecoveriesScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof RecoveriesScreen>;

export const CourtOrders: S = { name: 'Court orders' };
export const OrderPanel: S = { name: 'Court order record · remittances', args: { openId: 'co1' } };
export const CarryForwards: S = { name: 'Carry-forwards (negative net)', args: { tab: 'carry' } };
export const Overpayments: S = { name: 'Overpayments · consent and write-off', args: { tab: 'over' } };
export const Cap: S = { name: 'Deduction cap check · EMI deferred', args: { tab: 'cap' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
