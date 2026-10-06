import type { Meta, StoryObj } from '@storybook/react-vite';
import { RunWorkspaceScreen } from './payroll-run';

const meta: Meta<typeof RunWorkspaceScreen> = {
  title: 'Screens/Pay/PAY-09 · Publish payslips',
  component: RunWorkspaceScreen,
  parameters: { layout: 'fullscreen' },
  args: { phase: 'paid', tab: 'files', sheet: 'publish' },
};
export default meta;
type S = StoryObj<typeof RunWorkspaceScreen>;

export const Ready: S = { name: 'Impact preview · type to confirm' };
export const SelfApproval: S = { name: 'Sole payroll admin · reason required', args: { sheetVariant: 'self-approval' } };
export const Published: S = { name: 'Published · progress finished', args: { sheetVariant: 'done' } };
