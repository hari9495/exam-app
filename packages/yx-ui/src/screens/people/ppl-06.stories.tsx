import type { Meta, StoryObj } from '@storybook/react-vite';
import { REVIEW_ID } from '../../components/stepper';
import { BulkChangesWizard } from './changes';

const meta: Meta = { title: 'Screens/People/PPL-06 · Bulk changes wizard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const People: S = { name: 'Step 1 · choose people', render: () => <BulkChangesWizard /> };
export const Rule: S = { name: 'Step 2 · increment rule', render: () => <BulkChangesWizard current="rule" /> };
export const Preview: S = { name: 'Step 3 · per-person preview (3 above band)', render: () => <BulkChangesWizard current="preview" /> };
export const Review: S = { name: 'Review', render: () => <BulkChangesWizard current={REVIEW_ID} /> };
export const Confirm: S = { name: 'Send for approval', render: () => <BulkChangesWizard current={REVIEW_ID} confirmOpen /> };
