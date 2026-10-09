import type { Meta, StoryObj } from '@storybook/react-vite';
import { RunWorkspaceScreen } from './payroll-run';

const meta: Meta<typeof RunWorkspaceScreen> = {
  title: 'Screens/Pay/PAY-07 · Approve run and lock period',
  component: RunWorkspaceScreen,
  parameters: { layout: 'fullscreen' },
  args: { persona: 'fin', sheet: 'approve', tab: 'variance', exceptionsOpen: false },
};
export default meta;
type S = StoryObj<typeof RunWorkspaceScreen>;

export const Ready: S = { name: 'Impact preview · type to confirm' };
export const Blocked: S = { name: 'Blocked · attendance exceptions open', args: { sheetVariant: 'blocked', exceptionsOpen: true } };
export const SamePerson: S = { name: 'Maker is checker · refused', args: { sheetVariant: 'same-person' } };
export const SelfApproval: S = { name: 'Sole approver · self-approval with reason', args: { sheetVariant: 'self-approval' } };
export const Done: S = { name: 'Approved and locked', args: { sheetVariant: 'done' } };
