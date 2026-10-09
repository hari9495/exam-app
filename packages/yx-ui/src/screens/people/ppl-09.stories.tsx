import type { Meta, StoryObj } from '@storybook/react-vite';
import { REVIEW_ID } from '../../components/stepper';
import { RestructureWizard } from './changes';

const meta: Meta = { title: 'Screens/People/PPL-09 · Bulk transfer and restructure', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Scope: S = { name: 'Step 1 · merge scope', render: () => <RestructureWizard /> };
export const Options: S = { name: 'Step 2 · transfer options and overrides', render: () => <RestructureWizard current="options" /> };
export const CloseBlocked: S = { name: 'Step 3 · close blocked (payroll not locked)', render: () => <RestructureWizard current="close" payrollLocked={false} /> };
export const CloseReady: S = { name: 'Step 3 · close checks pass', render: () => <RestructureWizard current="close" /> };
export const Confirm: S = { name: 'Review and send for approval (typed)', render: () => <RestructureWizard current={REVIEW_ID} confirmOpen /> };
