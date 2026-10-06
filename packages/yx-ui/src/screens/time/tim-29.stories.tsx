import type { Meta, StoryObj } from '@storybook/react-vite';
import { YearEndWizard } from './leave-admin';

const meta: Meta<typeof YearEndWizard> = { title: 'Screens/Time/TIM-29 · Year-end wizard', component: YearEndWizard, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof YearEndWizard>;

export const Scope: S = { name: 'Year-end · scope' };
export const Preview: S = { name: 'Year-end · preview', args: { current: 'preview' } };
export const Review: S = { name: 'Year-end · review (on 2 Jan 2027)', args: { current: 'review', asOf: new Date(2027, 0, 2), pendingAcknowledged: true } };
export const Blocked: S = { name: 'Year-end · review (before 1 Jan, post blocked)', args: { current: 'review' } };
export const PendingBlocked: S = { name: 'Year-end · scope (on 2 Jan 2027, pending requests)', args: { asOf: new Date(2027, 0, 2) } };
export const Post: S = { name: 'Year-end · typed confirmation (on 2 Jan 2027)', args: { current: 'review', confirm: true, asOf: new Date(2027, 0, 2), pendingAcknowledged: true } };
export const Transition: S = { name: 'Leave-year change · scope', args: { mode: 'transition' } };
export const TransitionPreview: S = { name: 'Leave-year change · preview', args: { mode: 'transition', current: 'preview' } };
export const Posted: S = { name: 'Year-end · posted (on 2 Jan 2027)', args: { posted: true, asOf: new Date(2027, 0, 2), pendingAcknowledged: true } };
export const TransitionPosted: S = { name: 'Leave-year change · posted', args: { mode: 'transition', posted: true } };
