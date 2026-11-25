import type { Meta, StoryObj } from '@storybook/react-vite';
import { EnrolmentSheet } from './learn-me';
import { COURSES, SESSION_PEOPLE } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-06 · Nomination, enrolment and external request', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const PEOPLE = SESSION_PEOPLE.map((n, i) => ({ value: `p${i}`, label: n }));
const SESSION = { label: 'SPC, 15–16 Oct, Bengaluru', seats: 15, enrolled: Array.from({ length: 14 }, (_, i) => `x${i}`), waitlist: [] };
const QUALITY = { department: 'Quality', planned: 3_00_000, spent: 1_12_000, committed: 90_000 };

export const ManagerNominates: S = { name: 'Manager · nominate (seat and waitlist)', render: () => <EnrolmentSheet mode="nominate" persona="mgr" course={COURSES[5]} session={SESSION} people={PEOPLE} budget={{ ...QUALITY, mode: 'warn' }} /> };
export const BudgetBlocked: S = { name: 'Manager · over budget (block)', render: () => <EnrolmentSheet mode="nominate" persona="mgr" course={COURSES[5]} session={SESSION} people={PEOPLE} budget={{ ...QUALITY, committed: 1_80_000, mode: 'block' }} /> };
export const SelfEnrol: S = { name: 'Employee · self-enrol needing approval', render: () => <EnrolmentSheet mode="self" persona="emp" course={COURSES[3]} session={{ label: 'Risk-based testing, 8 and 10 Oct', seats: 20, enrolled: ['a', 'b'], waitlist: [] }} budget={{ ...QUALITY, mode: 'warn' }} /> };
export const External: S = { name: 'Employee · external training with bond', render: () => <EnrolmentSheet mode="external" persona="emp" course={COURSES[5]} defaultCost={32000} budget={{ ...QUALITY, mode: 'warn' }} /> };
export const ExternalPhone: S = { name: 'Employee · external request on phone', globals: PHONE, render: () => <EnrolmentSheet mode="external" persona="emp" device="phone" course={COURSES[5]} defaultCost={32000} budget={{ ...QUALITY, mode: 'warn' }} /> };
export const Decline: S = { name: 'Employee · decline nomination', globals: PHONE, render: () => <EnrolmentSheet mode="decline" persona="emp" device="phone" course={COURSES[3]} budget={{ ...QUALITY, mode: 'warn' }} /> };
export const DeclineMandatory: S = { name: 'Employee · mandatory cannot be declined', render: () => <EnrolmentSheet mode="decline" persona="emp" course={COURSES[2]} mandatory budget={{ ...QUALITY, mode: 'warn' }} /> };
export const LdNominates: S = { name: 'L&D · nominate a group', render: () => <EnrolmentSheet mode="nominate" persona="ld" course={COURSES[2]} session={{ label: 'Fire safety, 28 Oct, Chennai office', seats: 25, enrolled: [], waitlist: [] }} people={PEOPLE} budget={{ ...QUALITY, mode: 'warn' }} /> };
