import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProbationReviewForm, ProbationReviewPhone } from './onboarding';

const meta: Meta = { title: 'Screens/People/PPL-17 · Probation review form', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Confirm: S = { name: 'Manager · confirm', render: () => <ProbationReviewForm /> };
export const ExtendOverLimit: S = { name: 'Extend beyond the policy maximum', render: () => <ProbationReviewForm outcome="extend" months={9} /> };
export const Terminate: S = { name: 'End employment (goes to HR)', render: () => <ProbationReviewForm outcome="terminate" /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <ProbationReviewPhone /> };
export const PhoneExtend: S = { name: '· phone, extend 3 months', ...phone, render: () => <ProbationReviewPhone outcome="extend" months={3} /> };
