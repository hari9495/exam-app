import type { Meta, StoryObj } from '@storybook/react-vite';
import { MergeReview, SamePersonQueue } from './relations';
import { MATCHES, MERGED_RECORDS } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-37 · Merge and unmerge', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Merge: S = { name: 'HR · field-by-field merge', render: () => <MergeReview /> };
export const NoteMissing: S = { name: 'Audit note missing', render: () => <MergeReview noteError /> };
export const Unmerge: S = { name: 'Unmerge restores the split', render: () => <MergeReview mode="unmerge" /> };
export const UnmergeConfirm: S = { name: 'Unmerge · confirm with note', render: () => <MergeReview mode="unmerge" noteError /> };
// Unmerge later: the Merged view of Possible same person lists every merged record; Open goes to its merge record.
export const MergedList: S = { name: 'Unmerge later · merged records list', render: () => <SamePersonQueue rows={MATCHES} view="merged" merged={MERGED_RECORDS} /> };
export const MergedEmpty: S = { name: 'Unmerge later · no merged records', render: () => <SamePersonQueue rows={MATCHES} view="merged" /> };
