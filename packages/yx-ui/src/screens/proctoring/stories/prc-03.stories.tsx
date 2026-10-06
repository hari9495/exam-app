import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuestionReviewQueueScreen, REVIEW_ITEMS } from '../bank-tests';

const meta: Meta<typeof QuestionReviewQueueScreen> = { title: 'Screens/Proctoring/PRC-03 · Question review queue', component: QuestionReviewQueueScreen, parameters: { layout: 'fullscreen' }, args: { items: REVIEW_ITEMS } };
export default meta;
type S = StoryObj<typeof QuestionReviewQueueScreen>;

export const Default: S = { name: 'Version diff with field comments' };
export const Duplicate: S = { name: 'Near-duplicate must be confirmed', args: { defaultOpenId: 'Q-1088' } };
export const Approved: S = { args: { decided: 'approved' } };
export const ChangesRequested: S = { name: 'Changes requested', args: { decided: 'changes' } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };
