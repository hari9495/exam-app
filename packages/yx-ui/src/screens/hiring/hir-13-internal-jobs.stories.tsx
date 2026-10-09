import type { Meta, StoryObj } from '@storybook/react-vite';
import { InternalJobsPhone, InternalJobsScreen } from './hiring-plan';
import { INTERNAL_APPS, JOBS } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-13 · Internal jobs', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const INTERNAL = JOBS.filter((j) => j.internal && j.status === 'Open');
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Browse: S = { name: 'Browse and my applications', render: () => <InternalJobsScreen jobs={INTERNAL} applications={INTERNAL_APPS} /> };
export const Apply: S = { name: 'Apply sheet', render: () => <InternalJobsScreen jobs={INTERNAL} applications={INTERNAL_APPS} applyFor="j3" /> };
export const NotEligible: S = { name: 'Blocked · not yet eligible', render: () => <InternalJobsScreen jobs={INTERNAL} applications={[]} applyFor="j1" eligible={false} /> };
export const Empty: S = { name: 'Empty · no openings', render: () => <InternalJobsScreen jobs={[]} applications={[]} /> };
export const Phone: S = { name: 'phone', globals: PHONE, render: () => <InternalJobsPhone jobs={INTERNAL} applications={INTERNAL_APPS} /> };
export const PhoneApply: S = { name: 'phone · apply', globals: PHONE, render: () => <InternalJobsPhone jobs={INTERNAL} applications={INTERNAL_APPS} applyFor="j1" /> };
