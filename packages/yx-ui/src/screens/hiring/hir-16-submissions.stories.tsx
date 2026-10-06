import type { Meta, StoryObj } from '@storybook/react-vite';
import { SubmissionsBoardScreen } from './hiring-staffing';
import { SUBMISSIONS } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-16 · Submissions board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Board: S = { name: 'Account manager · board', render: () => <SubmissionsBoardScreen rows={SUBMISSIONS} /> };
export const Submit: S = { name: 'Submit to client (bulk)', render: () => <SubmissionsBoardScreen rows={SUBMISSIONS} submitOpen /> };
export const Recruiter: S = { name: 'Recruiter · submit sheet', render: () => <SubmissionsBoardScreen rows={SUBMISSIONS} persona="recruiter" submitOpen /> };
export const Empty: S = { name: 'Empty', render: () => <SubmissionsBoardScreen rows={[]} /> };
export const Loading: S = { name: 'Loading', render: () => <SubmissionsBoardScreen rows={[]} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <SubmissionsBoardScreen rows={[]} state="error" /> };
