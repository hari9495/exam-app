import type { Meta, StoryObj } from '@storybook/react-vite';
import { OneTimePayScreen } from './payroll-inputs';

const meta: Meta<typeof OneTimePayScreen> = { title: 'Screens/Pay/PAY-05 · One-time pay', component: OneTimePayScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof OneTimePayScreen>;

export const List: S = { name: 'List · filters and bulk actions' };
export const AddSheet: S = { name: 'Add one-time pay · effect summary', args: { sheet: 'add' } };
export const Recurring: S = { name: 'Add recurring item · prorated months', args: { sheet: 'recurring' } };
export const BulkUpload: S = { name: 'Bulk upload · row validation', args: { upload: true } };
export const Empty: S = { name: 'Empty · first use', args: { rows: [] } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
