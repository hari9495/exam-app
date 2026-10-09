import type { Meta, StoryObj } from '@storybook/react-vite';
import { RunWorkspaceScreen } from './payroll-run';

const meta: Meta<typeof RunWorkspaceScreen> = {
  title: 'Screens/Pay/PAY-08 · Release bank file',
  component: RunWorkspaceScreen,
  parameters: { layout: 'fullscreen' },
  args: { persona: 'fin', phase: 'approved', tab: 'files', sheet: 'bank' },
};
export default meta;
type S = StoryObj<typeof RunWorkspaceScreen>;

export const Ready: S = { name: 'Impact preview · type to confirm' };
export const Regenerate: S = { name: 'Regenerate with reason', args: { sheetVariant: 'regenerate' } };
export const Released: S = { name: 'Released · download', args: { sheetVariant: 'done' } };
