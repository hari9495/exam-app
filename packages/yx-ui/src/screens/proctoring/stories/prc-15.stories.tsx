import type { Meta, StoryObj } from '@storybook/react-vite';
import { AUDIT_ROWS, CompanyAuditScreen } from '../live';

const meta: Meta<typeof CompanyAuditScreen> = { title: 'Screens/Proctoring/PRC-15 · Company audit view', component: CompanyAuditScreen, parameters: { layout: 'fullscreen' }, args: { rows: AUDIT_ROWS } };
export default meta;
type S = StoryObj<typeof CompanyAuditScreen>;

export const Default: S = { name: 'Grouped by slot' };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };
export const Error: S = { args: { state: 'error' } };
