import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyWriterScreen, type Clause, type Finding } from './cases-more';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-14 · Write policies with AI', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const CLAUSES: Clause[] = [
  { id: 'c1', title: 'Earned leave', text: 'Employees earn 15 days of earned leave a year, credited monthly.', source: 'company', finding: 'f1' },
  { id: 'c2', title: 'Earned leave for plant staff', text: 'Workers at the Hosur plant earn 1 day of leave for every 20 days worked.', source: 'law', ref: 'IN.OSH TN 2026-01' },
  { id: 'c3', title: 'Carry forward', text: 'Up to 45 days can be carried forward; days above that lapse on 31 Dec.', source: 'ai' },
  { id: 'c4', title: 'Sick leave', text: 'Employees get 12 days of sick leave a year. A medical certificate is needed for more than 2 days in a row.', source: 'law', ref: 'KA S&E 2025-04', finding: 'f2' },
];
const FINDINGS: Finding[] = [
  { id: 'f1', state: 'Tamil Nadu', text: '15 earned leave days is below the minimum for plant workers with 240+ days worked (18 days).', status: 'open' },
  { id: 'f2', state: 'Karnataka', text: 'Sick leave matches the state minimum.', status: 'resolved' },
];

export const Questionnaire: S = { render: () => <PolicyWriterScreen step="questionnaire" clauses={[]} findings={[]} /> };
export const Generating: S = { name: 'Drafting (loading)', render: () => <PolicyWriterScreen step="generating" clauses={[]} findings={[]} /> };
export const DraftBlocked: S = { name: 'Draft · law finding blocks approval', render: () => <PolicyWriterScreen clauses={CLAUSES} findings={FINDINGS} /> };
export const ApproveLoad: S = { name: 'Findings resolved · Approve & load', render: () => <PolicyWriterScreen clauses={CLAUSES} findings={FINDINGS.map((f) => ({ ...f, status: 'resolved' as const }))} approveOpen /> };
