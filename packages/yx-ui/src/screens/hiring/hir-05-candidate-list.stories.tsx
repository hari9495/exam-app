import type { Meta, StoryObj } from '@storybook/react-vite';
import { CandidateListScreen } from './hiring-candidates';
import type { CandidateRow, DuplicatePairView, TalentList } from './live/types';

// HIR-05 List (founder decision 9): the candidate list drawn from the kit, then wired to /yx/hiring/candidates. The
// lower-case exports are sample data shared with the tests, not stories.
const meta: Meta = { title: 'Screens/Hiring/HIR-05 · Candidate list', parameters: { layout: 'fullscreen' }, excludeStories: /^[a-z]/ };
export default meta;
type S = StoryObj;

export const sampleRows: CandidateRow[] = [
  { id: 'c1', name: 'Ananya Iyer', email: 'ananya.iyer@mailbox.in', phone: '+91 98450 11223', status: 'active', globalStage: 'engaged', createdAt: '2026-09-27T05:30:00.000Z', neverInvited: false },
  { id: 'c2', name: 'Vikram Reddy', email: 'vikram.r@postbox.in', phone: '+91 99001 44556', status: 'active', globalStage: 'available', createdAt: '2026-09-12T05:30:00.000Z', neverInvited: true },
  { id: 'c3', name: 'Fatima Shaikh', email: 'fatima.s@mailbox.in', phone: '+91 97890 22334', status: 'active', globalStage: 'in_review', createdAt: '2026-09-27T05:30:00.000Z', neverInvited: false },
  { id: 'c4', name: 'Meera Nair', email: 'meera.n@mailbox.in', phone: null, status: 'inactive', globalStage: 'rejected', createdAt: '2026-06-02T05:30:00.000Z', neverInvited: true },
];
export const samplePairs: DuplicatePairView[] = [
  { a: { id: 'c1', name: 'Ananya Iyer', email: 'ananya.iyer@mailbox.in', phone: '+91 98450 11223' }, b: { id: 'c9', name: 'Ananya S Iyer', email: 'ananya.work@postbox.in', phone: '98450 11223' }, reasons: ['phone', 'resume'], score: 0.94 },
];
export const sampleLists: TalentList[] = [
  { id: 'l1', name: 'QA talent', kind: 'pool', description: null, members: 4 },
  { id: 'l2', name: 'Chennai testers this week', kind: 'hotlist', description: null, members: 2 },
];
const common = {
  duplicates: samplePairs,
  lists: sampleLists,
  exams: [{ value: 'e1', label: 'QA aptitude' }],
  openJobs: [{ value: 'j1', label: 'Senior QA Engineer' }],
  templates: [{ value: 't1', label: 'Thank you', subject: 'Thank you, {{candidateName}}', body: 'Thank you for applying to {{orgName}}.' }],
};

export const Recruiter: S = { name: 'Recruiter · default', render: () => <CandidateListScreen rows={sampleRows} {...common} /> };
export const HiringManager: S = { name: 'Hiring manager · read-only', render: () => <CandidateListScreen rows={sampleRows} {...common} canManage={false} canMerge={false} /> };
export const Empty: S = { name: 'Empty · first use', render: () => <CandidateListScreen rows={[]} {...common} duplicates={[]} /> };
export const Loading: S = { name: 'Loading', render: () => <CandidateListScreen rows={[]} {...common} state="loading" /> };
export const Failed: S = { name: 'Error', render: () => <CandidateListScreen rows={[]} {...common} state="error" /> };
// Drawn 13 Nov 2026 (Hiring walk, answer 476): opened by someone without a candidate key (the menu never offers it).
export const NoAccess: S = { name: 'No access · no candidate key', render: () => <CandidateListScreen rows={[]} {...common} state="no-access" /> };
export const Duplicates: S = { name: 'Possible duplicates', render: () => <CandidateListScreen rows={sampleRows} {...common} tab="duplicates" /> };
export const DuplicatesNoMergeKey: S = { name: 'Possible duplicates · no data-rights key', render: () => <CandidateListScreen rows={sampleRows} {...common} tab="duplicates" canMerge={false} /> };
export const MergePair: S = { name: 'Possible duplicates · compare and merge', render: () => <CandidateListScreen rows={sampleRows} {...common} tab="duplicates" mergePair={0} /> };
