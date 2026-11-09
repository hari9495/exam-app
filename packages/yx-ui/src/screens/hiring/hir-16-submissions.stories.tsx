import type { Meta, StoryObj } from '@storybook/react-vite';
import { SubmissionsBoardScreen } from './hiring-staffing';
import { SUBMISSIONS } from './hiring-data';
import { ClientJobSheet, SubmitToClientSheet } from './staffing-sheets';

const meta: Meta = { title: 'Screens/Hiring/HIR-16 · Submissions board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Board: S = { name: 'Account manager · board', render: () => <SubmissionsBoardScreen rows={SUBMISSIONS} /> };
export const Submit: S = { name: 'Submit to client (bulk)', render: () => <SubmissionsBoardScreen rows={SUBMISSIONS} submitOpen /> };
export const Recruiter: S = { name: 'Recruiter · submit sheet', render: () => <SubmissionsBoardScreen rows={SUBMISSIONS} persona="recruiter" submitOpen /> };
export const Empty: S = { name: 'Empty', render: () => <SubmissionsBoardScreen rows={[]} /> };
export const Loading: S = { name: 'Loading', render: () => <SubmissionsBoardScreen rows={[]} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <SubmissionsBoardScreen rows={[]} state="error" /> };

// Drawn for the live page (staffing slice 2): submit by email to a client contact; bench people first; masked by default.
const OPTIONS = {
  job: { id: 'j1', title: 'Java Developer', client: 'Nilgiri Retail Pvt Ltd' },
  billRate: '1200.00',
  unit: 'hour',
  mask: true,
  people: [
    { kind: 'employee' as const, id: 'e1', name: 'Suresh Menon', note: 'Bench since 2026-09-01' },
    { kind: 'candidate' as const, id: 'c1', name: 'Deepak Rao', note: 'In this job’s pipeline' },
  ],
  contacts: [{ id: 'k1', name: 'Rekha Balan', role: 'Engineering manager' }],
};
export const SubmitByEmail: S = {
  name: 'Submit to client · by email',
  render: () => (
    <>
      <SubmissionsBoardScreen rows={SUBMISSIONS} />
      <SubmitToClientSheet open onOpenChange={() => {}} jobs={[{ value: 'j1', label: 'Java Developer · Nilgiri Retail Pvt Ltd' }]} initialJobId="j1" loadOptions={async () => OPTIONS} onSave={async () => {}} />
    </>
  ),
};
export const DeskOff: S = { name: 'Desk off', render: () => <SubmissionsBoardScreen live={{ state: 'off', onRetry: () => {}, rows: [], onSubmit: () => {}, onMove: () => {} }} /> };
export const NewClientJob: S = {
  name: 'New client job · on a rate-card line',
  render: () => (
    <>
      <SubmissionsBoardScreen rows={SUBMISSIONS} />
      <ClientJobSheet open onOpenChange={() => {}} clients={[{ value: 'c1', label: 'Nilgiri Retail Pvt Ltd' }]} loadLines={async () => [{ value: 'l1', label: 'Java Developer · Chennai · ₹1,200 per hour' }]} onSave={async () => {}} />
    </>
  ),
};
