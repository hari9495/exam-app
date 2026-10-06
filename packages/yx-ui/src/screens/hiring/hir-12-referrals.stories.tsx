import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReferralsPhone, ReferralsScreen } from './hiring-plan';
import { JOBS, REFERRALS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-12 · Referrals', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const OPEN = JOBS.filter((j) => j.status === 'Open');
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const MyReferrals: S = { name: 'My referrals and bonus status', render: () => <ReferralsScreen jobs={OPEN} referrals={REFERRALS} today={TODAY} /> };
export const Refer: S = { name: 'Refer sheet', render: () => <ReferralsScreen jobs={OPEN} referrals={REFERRALS} today={TODAY} referOpen /> };
export const Duplicate: S = { name: 'Blocked · already applied', render: () => <ReferralsScreen jobs={OPEN} referrals={REFERRALS} today={TODAY} referOpen duplicate /> };
export const Empty: S = { name: 'Empty', render: () => <ReferralsScreen jobs={OPEN} referrals={[]} today={TODAY} /> };
export const Phone: S = { name: 'phone', globals: PHONE, render: () => <ReferralsPhone jobs={OPEN} referrals={REFERRALS} today={TODAY} /> };
export const PhoneRefer: S = { name: 'phone · refer', globals: PHONE, render: () => <ReferralsPhone jobs={OPEN} referrals={REFERRALS} today={TODAY} referOpen /> };
