import type { Meta, StoryObj } from '@storybook/react-vite';
import { IncentiveStatementScreen } from './employee-pay';

const meta: Meta<typeof IncentiveStatementScreen> = { title: 'Screens/Pay/PAY-33 · My incentive statement', component: IncentiveStatementScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IncentiveStatementScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Default: S = { name: 'Earned, paid, held' };
export const Clawback: S = { name: 'With a clawback', args: { variant: 'clawback' } };
export const Empty: S = { name: 'Empty · not on a plan', args: { variant: 'empty' } };
export const Phone: S = { name: 'phone', args: { layout: 'phone' }, ...phone };
export const PhoneClawback: S = { name: 'phone · clawback', args: { layout: 'phone', variant: 'clawback' }, ...phone };
