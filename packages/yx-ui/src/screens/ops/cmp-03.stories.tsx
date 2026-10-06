import type { Meta, StoryObj } from '@storybook/react-vite';
import { RegistersScreen } from './compliance';
import { REGISTER_ROWS } from './compliance-data';

const meta: Meta = { title: 'Screens/Compliance/CMP-03 · Statutory registers', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Epf: S = { name: 'EPF (covered / not covered)', render: () => <RegistersScreen rows={REGISTER_ROWS} /> };
export const Esic: S = { name: 'ESIC (not covered above ceiling)', render: () => <RegistersScreen rows={REGISTER_ROWS} kind="ESIC" /> };
export const Pt: S = { name: 'PT', render: () => <RegistersScreen rows={REGISTER_ROWS} kind="PT" /> };
export const LwfNotDue: S = { name: 'LWF (not due this month)', render: () => <RegistersScreen rows={REGISTER_ROWS} kind="LWF" lwfNotDue /> };
export const Empty: S = { render: () => <RegistersScreen rows={[]} state="empty" /> };
export const Loading: S = { render: () => <RegistersScreen rows={REGISTER_ROWS} state="loading" /> };
export const Error: S = { render: () => <RegistersScreen rows={REGISTER_ROWS} state="error" /> };
