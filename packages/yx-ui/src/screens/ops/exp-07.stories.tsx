import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyMatrixScreen } from './expenses-finance';
import { POLICY_MATRIX } from './expenses-data';

const meta: Meta = { title: 'Screens/Expenses/EXP-07 · Expense policy matrix', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Matrix: S = { name: 'Matrix (finance edits)', render: () => <PolicyMatrixScreen matrix={POLICY_MATRIX} /> };
export const Unsaved: S = { name: 'Unsaved changes · new version', render: () => <PolicyMatrixScreen matrix={POLICY_MATRIX} dirty /> };
export const HrReadOnly: S = { name: 'HR (read only)', render: () => <PolicyMatrixScreen matrix={POLICY_MATRIX} persona="hr" /> };
