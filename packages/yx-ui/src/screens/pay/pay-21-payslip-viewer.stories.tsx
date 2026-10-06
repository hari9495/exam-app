import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayslipViewerScreen } from './employee-pay';

const meta: Meta<typeof PayslipViewerScreen> = { title: 'Screens/Pay/PAY-21 · Payslip viewer', component: PayslipViewerScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayslipViewerScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Desktop: S = { name: 'Net first · why this number' };
export const RaiseQuery: S = { name: 'Raise a query on a line', args: { variant: 'query' } };
export const QuerySent: S = { name: 'Query sent', args: { variant: 'query-sent' } };
export const Document: S = { name: 'Payslip PDF', args: { variant: 'document' } };
export const Held: S = { name: 'Salary on hold', args: { variant: 'held' } };
export const NotPublished: S = { name: 'Empty · not published yet', args: { variant: 'not-published' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
export const Phone: S = { name: 'phone', args: { layout: 'phone' }, ...phone };
export const PhoneQuery: S = { name: 'phone · raise a query', args: { layout: 'phone', variant: 'query' }, ...phone };
