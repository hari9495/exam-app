import type { Meta, StoryObj } from '@storybook/react-vite';
import { MergeReview } from './relations';

const meta: Meta = { title: 'Screens/People/PPL-37 · Merge and unmerge', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Merge: S = { name: 'HR · field-by-field merge', render: () => <MergeReview /> };
export const NoteMissing: S = { name: 'Audit note missing', render: () => <MergeReview noteError /> };
export const Unmerge: S = { name: 'Unmerge restores the split', render: () => <MergeReview mode="unmerge" /> };
export const UnmergeConfirm: S = { name: 'Unmerge · confirm with note', render: () => <MergeReview mode="unmerge" noteError /> };
