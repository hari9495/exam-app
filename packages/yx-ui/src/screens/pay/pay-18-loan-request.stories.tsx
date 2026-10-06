import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoanRequestScreen } from './employee-pay';

const meta: Meta<typeof LoanRequestScreen> = { title: 'Screens/Pay/PAY-18 · Loan or salary advance request', component: LoanRequestScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LoanRequestScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Advance: S = { name: 'Salary advance · schedule preview' };
export const OverLimit: S = { name: 'Personal loan · over limit', args: { variant: 'over-limit' } };
export const NotEligible: S = { name: 'Not eligible · new joiner on probation', args: { variant: 'not-eligible' } };
export const Submitted: S = { name: 'Submitted · approval steps', args: { variant: 'submitted' } };
export const Phone: S = { name: 'phone', args: { layout: 'phone' }, ...phone };
export const PhoneSubmitted: S = { name: 'phone · submitted', args: { layout: 'phone', variant: 'submitted' }, ...phone };
