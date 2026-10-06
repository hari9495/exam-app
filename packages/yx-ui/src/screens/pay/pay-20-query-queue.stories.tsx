import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryQueueScreen } from './payroll-inputs';

const meta: Meta<typeof QueryQueueScreen> = { title: 'Screens/Pay/PAY-20 · Payslip query queue', component: QueryQueueScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof QueryQueueScreen>;

export const Open: S = { name: 'Open queries' };
export const Thread: S = { name: 'Query drawer · reply in app', args: { openId: 'q1' } };
export const InProgress: S = { name: 'Query in progress', args: { openId: 'q2' } };
export const Empty: S = { name: 'Empty', args: { rows: [] } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
