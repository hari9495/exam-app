import type { Meta, StoryObj } from '@storybook/react-vite';
import { MissingIdsScreen } from './compliance';
import { MISSING_IDS } from './compliance-data';

const meta: Meta = { title: 'Screens/Compliance/CMP-07 · Missing-ID dashboard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const PayrollAdmin: S = { name: 'Payroll admin', render: () => <MissingIdsScreen rows={MISSING_IDS} /> };
export const Hr: S = { name: 'HR (import option)', render: () => <MissingIdsScreen rows={MISSING_IDS} persona="hr" /> };
export const AllClear: S = { name: 'Empty (all IDs complete)', render: () => <MissingIdsScreen rows={[]} /> };
export const Loading: S = { render: () => <MissingIdsScreen rows={MISSING_IDS} loading /> };
