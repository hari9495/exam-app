import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExitInterview, ExitInterviewPhone } from './exits';

const meta: Meta = { title: 'Screens/People/PPL-21 · Exit interview', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };
const mine = { kind: 'mine' as const, onRetry: () => {}, onSubmit: async () => {} };
const form = { sections: [], rules: [] };
const hr = { kind: 'hr' as const, onRetry: () => {}, name: 'Meera Iyer', onNotes: async () => {}, onBack: () => {} };

export const Employee: S = { name: 'Employee · survey', render: () => <ExitInterview /> };
export const Answered: S = { name: 'Employee · answers sent', render: () => <ExitInterview live={{ ...mine, state: 'ready', data: { form, status: 'submitted', lastDay: '2026-10-19' } }} /> };
export const NoInterview: S = { name: '· employee, no exit interview to answer', render: () => <ExitInterview live={{ ...mine, state: 'ready', data: { form, status: null, lastDay: null } }} /> };
export const Loading: S = { name: '· employee, loading', render: () => <ExitInterview live={{ ...mine, state: 'loading', data: null }} /> };
export const Hr: S = { name: 'HR · answers and notes (confidential)', render: () => <ExitInterview persona="hr" /> };
export const HrNotAnswered: S = { name: 'HR · not answered yet', render: () => <ExitInterview live={{ ...hr, state: 'ready', data: { form, status: 'sent', submittedAt: null, answers: null, hrNotes: null } }} /> };
export const HrNoKey: S = { name: '· HR without the confidential exit key', render: () => <ExitInterview live={{ ...hr, state: 'no-access', data: null }} /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <ExitInterviewPhone /> };
