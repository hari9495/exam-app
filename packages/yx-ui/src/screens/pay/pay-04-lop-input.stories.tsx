import type { Meta, StoryObj } from '@storybook/react-vite';
import { LopInputScreen } from './payroll-inputs';
import { LOP_ROWS } from './pay-data';

const meta: Meta<typeof LopInputScreen> = { title: 'Screens/Pay/PAY-04 · Manual LOP input', component: LopInputScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LopInputScreen>;

export const Default: S = { name: 'Inline entry · one row with an error' };
export const BulkUpload: S = { name: 'Bulk upload · row validation', args: { upload: true } };
export const Frozen: S = { name: 'Period frozen · late request only', args: { locked: true, rows: LOP_ROWS.map((r) => ({ ...r, error: undefined })) } };
export const Empty: S = { name: 'Empty · no Assumed-present groups', args: { rows: [] } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
