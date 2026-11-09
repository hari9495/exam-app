import type { Meta, StoryObj } from '@storybook/react-vite';
import { AllReferralsScreen, ReferralsPhone, ReferralsScreen, type AllReferral } from './hiring-plan';
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

// HR's view of every referral (founder answer 204): filters, the bonus status, and Mark bonus paid with a confirm.
const ALL: AllReferral[] = [
  { id: 'a1', name: 'Kiran Rao', job: 'Accountant', referrer: 'Neha Joshi', referred: new Date(2026, 4, 2), stage: 'Hired', bonus: 'due', dueOn: new Date(2026, 8, 29), amount: 15_000 },
  { id: 'a2', name: 'Neha Das', job: 'Shift Lead', referrer: 'Imran Qureshi', referred: new Date(2026, 2, 11), stage: 'Hired', bonus: 'paid', dueOn: new Date(2026, 6, 19), amount: 15_000 },
  { id: 'a3', name: 'Vikram Reddy', job: 'Senior QA Engineer', referrer: 'Neha Joshi', referred: new Date(2026, 8, 8), stage: 'In process', bonus: 'not-hired', dueOn: null, amount: 25_000 },
  { id: 'a4', name: 'Sana Sheikh', job: 'Senior QA Engineer', referrer: 'Arjun Kulkarni', referred: new Date(2026, 6, 1), stage: 'Hired', bonus: 'waiting', dueOn: new Date(2026, 10, 20), amount: 25_000 },
  { id: 'a5', name: 'Rohit Bhat', job: 'Shift Lead', referrer: 'Imran Qureshi', referred: new Date(2026, 3, 4), stage: 'Hired', bonus: 'left', dueOn: new Date(2026, 7, 3), amount: 15_000 },
  { id: 'a6', name: 'Ajay Menon', job: 'Sales Manager, South', referrer: 'Kavya Nair', referred: new Date(2026, 7, 30), stage: 'Not selected', bonus: 'none', dueOn: null, amount: 25_000 },
];
export const AllReferrals: S = { name: 'All referrals (HR)', render: () => <AllReferralsScreen rows={ALL} /> };
export const AllReferralsMarkPaid: S = { name: 'All referrals · mark bonus paid', render: () => <AllReferralsScreen rows={ALL} confirmId="a1" /> };
export const AllReferralsEmpty: S = { name: 'All referrals · empty', render: () => <AllReferralsScreen rows={[]} /> };
