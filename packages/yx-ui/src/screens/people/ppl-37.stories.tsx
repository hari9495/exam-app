import type { Meta, StoryObj } from '@storybook/react-vite';
import { MergeReview } from './relations';
import { MergeList } from './declarations-live';

const meta: Meta = { title: 'Screens/People/PPL-37 · Merge and unmerge', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Merge: S = { name: 'HR · field-by-field merge', render: () => <MergeReview /> };
export const NoteMissing: S = { name: 'Audit note missing', render: () => <MergeReview noteError /> };
export const Unmerge: S = { name: 'Unmerge restores the split', render: () => <MergeReview mode="unmerge" /> };
export const UnmergeConfirm: S = { name: 'Unmerge · confirm with note', render: () => <MergeReview mode="unmerge" noteError /> };
export const Merges: S = {
  name: 'Merged records (each open to undo)',
  render: () => (
    <MergeList
      state="ready"
      onRetry={() => {}}
      onOpen={() => {}}
      rows={[
        { id: 'm1', kept: { personId: 'p1', name: 'Suresh K Nair' }, merged: { personId: 'p2', name: 'Suresh Nair' }, mergedAt: '2026-09-26T10:12:00Z', mergedBy: 'Lakshmi Venkatesan', note: 'Same DOB, near-identical phone; confirmed by call with the candidate on 26 Sep.', unmergedAt: null, unmergeNote: null, roles: [], rows: [] },
      ]}
    />
  ),
};
