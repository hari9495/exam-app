import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyWriterScreen, type Clause, type Finding } from './cases-more';
import { WRITER_DRAFT, WRITER_RESOLVED, liveWriter } from './policy-writer-live-samples';
import type { WriterDraft } from './policy-writer-live';

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
export const AiOff: S = { name: 'AI off · start from a YukthiX starter', render: () => <PolicyWriterScreen step="questionnaire" ai="off" clauses={[]} findings={[]} /> };

// Round 2 (founder answers 101, 106 and the industry warning, 4 Nov 2026): states the real records have, drawn in the same look.
const POSH_DRAFT: WriterDraft = {
  ...WRITER_DRAFT,
  type: 'posh',
  typeLabel: 'POSH',
  mode: 'starter',
  values: { icMembers: 3, womenMembers: 1 },
  clauses: [
    { id: 'p1', title: 'Purpose', text: 'The company does not tolerate sexual harassment. This policy explains how to make a complaint and how it is handled.', source: 'company', editable: true },
    { id: 'v-icMembers', title: 'Internal Committee', text: 'The Internal Committee has 3 members, 1 woman among them. HR keeps their names on the notice board and in YukthiX.', source: 'company', editable: false, finding: 'f-posh-size' },
    { id: 'law-posh-ic', title: 'Who sits on the Internal Committee', text: 'Every office with 10 or more workers has an Internal Committee. A woman employed at a senior level presides. At least 2 members come from the employees and 1 member from an organisation committed to the cause of women. At least half the members are women. Members serve up to 3 years.', source: 'law', ref: 'IN.POSH 2013-v2 (verify)', editable: false },
    { id: 'law-posh-time', title: 'Time limits', text: 'A complaint is made within 3 months of the incident; the committee may allow 3 months more for reasons it records. The inquiry ends within 90 days, the report follows within 10 days, and the company acts on it within 60 days.', source: 'law', ref: 'IN.POSH 2013-v2 (verify)', editable: false },
  ],
  findings: [
    { id: 'f-posh-size', state: 'All states', text: 'Internal Committee: 3 members is below the minimum of 4 (a presiding woman, 2 employees, 1 from outside).', status: 'open', fix: { key: 'icMembers', value: 4 } },
    { id: 'f-posh-women', state: 'All states', text: 'Women on the Internal Committee: 1 of 3 is fewer than half (at least 2).', status: 'open', fix: { key: 'womenMembers', value: 2 } },
  ],
  openFindings: 2,
  target: { ...WRITER_DRAFT.target, title: 'Prevention of sexual harassment (POSH) policy' },
};
export const CounselNote: S = { name: 'Draft · counsel note (industry rules not checked)', render: () => <PolicyWriterScreen live={liveWriter({ draftId: 'd1', draft: WRITER_RESOLVED })} /> };
export const PoshDraft: S = { name: 'POSH draft · Internal Committee below the IN.POSH minimum', render: () => <PolicyWriterScreen live={liveWriter({ draftId: 'd1', draft: POSH_DRAFT })} /> };
export const Discard: S = { name: 'Draft · Discard (confirm)', render: () => <PolicyWriterScreen live={liveWriter({ draftId: 'd1', draft: WRITER_DRAFT, start: { discardOpen: true } })} /> };
export const Discarded: S = { name: 'Discarded by the daily clean-up', render: () => <PolicyWriterScreen live={liveWriter({ draftId: 'd1', draft: { ...WRITER_DRAFT, status: 'discarded', discardReason: 'expired', discardedAt: '2026-11-04T03:30:00.000Z' } })} /> };
