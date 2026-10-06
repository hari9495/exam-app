import type { Meta, StoryObj } from '@storybook/react-vite';
import { IdReviewQueueScreen } from '../live';

const meta: Meta<typeof IdReviewQueueScreen> = { title: 'Screens/Proctoring/Extra · ID manual review queue', component: IdReviewQueueScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IdReviewQueueScreen>;

export const LowMatch: S = { name: 'Low face-match score' };
export const AlternatePath: S = { name: 'No government ID: alternate path', args: { defaultId: 'IDV-312' } };
export const Approved: S = { args: { decided: 'approved' } };
export const NotVerified: S = { name: 'Not verified: live check offered', args: { decided: 'rejected' } };
