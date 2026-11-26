import type { Meta, StoryObj } from '@storybook/react-vite';
import { NominationsScreen } from './perf-reviews';
import { NOMINATIONS } from './perf-data-3';
import { PEOPLE } from './perf-data-2';

import { FeedbackTasksScreen, PeerFormScreen } from './peer-answer';
import type { PeerForm } from '../performance/live/types';
const meta: Meta = { title: 'Screens/Performance/PRF-07 · 360° nominations', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const EmployeeNominates: S = { name: 'Employee · nominate', render: () => <NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} /> };
export const BelowMinimum: S = { name: 'Employee · below minimum', render: () => <NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS.slice(0, 2)} /> };
export const Sent: S = { name: 'Employee · sent for approval', render: () => <NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} submitted /> };
export const ManagerApproves: S = { name: 'Manager · approve list', render: () => <NominationsScreen persona="mgr" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} /> };
export const Phone: S = { name: 'Employee · phone', globals: PHONE, render: () => <NominationsScreen persona="emp" device="phone" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} /> };
export const ManagerPhone: S = { name: 'Manager · phone', globals: PHONE, render: () => <NominationsScreen persona="mgr" device="phone" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} /> };
export const Empty: S = { render: () => <NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={[]} /> };
export const LoadError: S = { name: 'Error', render: () => <NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={[]} state="error" /> };

// Batch F (answer 2579): a colleague asked for feedback in a review, and answering it (anonymous, advisory).
const ASKED_FORM: PeerForm = {
  reviewId: 'r1',
  employee: 'Arjun Rao',
  cycle: 'FY 2025-26 annual review',
  dueOn: '2026-10-25',
  anonymous: true,
  sections: [{ id: 'c', title: 'Competencies', questions: [{ id: 'c', text: 'Competencies', answer: 'both', required: false, maxChars: 2000, wholeSection: true }] }],
  levels: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: ['Needs improvement', 'Partly meets', 'Meets', 'Exceeds', 'Outstanding'][v - 1] })),
  entry: null,
  can: { answer: true },
};
export const AskedTasks: S = { name: 'Colleague · feedback I was asked for', render: () => <FeedbackTasksScreen state="ready" tasks={[{ id: 't1', reviewId: 'r1', employee: 'Arjun Rao', cycle: 'FY 2025-26 annual review', dueOn: '2026-10-25', done: false, open: true }, { id: 't2', reviewId: 'r2', employee: 'Sita Iyer', cycle: 'FY 2025-26 annual review', dueOn: '2026-10-20', done: true, open: false }]} onOpen={() => undefined} /> };
export const AskedEmpty: S = { name: 'Colleague · nobody asked yet', render: () => <FeedbackTasksScreen state="ready" tasks={[]} onOpen={() => undefined} /> };
export const AnswerRequest: S = { name: 'Colleague · answer a request', render: () => <PeerFormScreen state="ready" form={ASKED_FORM} onBack={() => undefined} onSave={async () => ({})} /> };
export const AnswerSent: S = { name: 'Colleague · answer sent', render: () => <PeerFormScreen state="ready" form={{ ...ASKED_FORM, entry: { status: 'submitted', answers: {}, comment: null }, can: { answer: false } }} onBack={() => undefined} onSave={async () => ({})} /> };
