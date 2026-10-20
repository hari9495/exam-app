import type { Meta, StoryObj } from '@storybook/react-vite';
import { REVIEW_ID } from '../../components/stepper';
import { BulkChangesWizard } from './changes';
import type { IncrementResult } from './increment';

const meta: Meta = { title: 'Screens/People/PPL-06 · Bulk changes wizard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const People: S = { name: 'Step 1 · choose people', render: () => <BulkChangesWizard /> };
export const Rule: S = { name: 'Step 2 · increment rule', render: () => <BulkChangesWizard current="rule" /> };
export const Preview: S = { name: 'Step 3 · per-person preview (3 above band)', render: () => <BulkChangesWizard current="preview" /> };
export const Review: S = { name: 'Review', render: () => <BulkChangesWizard current={REVIEW_ID} /> };
export const Confirm: S = { name: 'Send for approval', render: () => <BulkChangesWizard current={REVIEW_ID} confirmOpen /> };
export const Same: S = { name: 'Step 2 · same raise for everyone', render: () => <BulkChangesWizard current="rule" mode="percent" /> };

/** The live wizard with sample answers from the API (no ratings for one person, one row the change engine refuses). */
const LIVE_RESULT: IncrementResult = {
  people: [
    { employeeId: 'e1', name: 'Arjun Kulkarni', code: 'KF-0142', department: 'Quality', grade: 'G5', rating: 'Exceeds', currentCtc: '960000.00', percent: '12', newCtc: '1075200.00' },
    { employeeId: 'e2', name: 'Kavya Reddy', code: 'KF-0031', department: 'Quality', grade: 'G3', rating: 'Meets', currentCtc: '333333.00', percent: '7.5', newCtc: '358333.00' },
  ],
  leftOut: [
    { employeeId: 'e3', name: 'Nikhil Rao', rating: null, why: 'No released rating in FY 2025-26 annual review.' },
    { employeeId: 'e4', name: 'Meera Iyer', rating: 'Meets', why: 'On notice.' },
  ],
  ratingCycles: [{ id: 'fy26', name: 'FY 2025-26 annual review' }],
  ratingCycleId: 'fy26',
  bands: ['Exceeds', 'Meets'],
  rows: [],
  errors: 0,
};
const live = {
  entities: [{ value: 'kf', label: 'Kaveri Foods Pvt Ltd' }],
  departments: [{ value: 'q', label: 'Quality' }],
  today: new Date(2026, 9, 20),
  canRate: true,
  onCheck: async () => LIVE_RESULT,
  onSend: async () => undefined,
};
export const Live: S = { name: 'Live · choose people', render: () => <BulkChangesWizard live={live} /> };
