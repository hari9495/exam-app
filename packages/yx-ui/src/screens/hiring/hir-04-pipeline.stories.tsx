import type { Meta, StoryObj } from '@storybook/react-vite';
import { PipelineBoardScreen } from './hiring-pipeline';
import { CANDIDATES, STAGES } from './hiring-data';
import { AddCandidateSheet, BulkActionsSheet, type BulkActionsSheetProps, type BulkRow } from './pipeline-sheets';

const meta: Meta = { title: 'Screens/Hiring/HIR-04 · Pipeline board', parameters: { layout: 'fullscreen' }, excludeStories: /^[a-z]/ };
export default meta;
type S = StoryObj;

const JOB = 'Senior QA Engineer';

export const Recruiter: S = { name: 'Recruiter · rich cards', render: () => <PipelineBoardScreen job={JOB} candidates={CANDIDATES} stages={STAGES} persona="recruiter" /> };
export const HiringManager: S = { name: 'Hiring manager', render: () => <PipelineBoardScreen job={JOB} candidates={CANDIDATES} stages={STAGES} persona="hm" /> };
export const MoveMenu: S = { name: 'Move to menu (keyboard alternative)', render: () => <PipelineBoardScreen job={JOB} candidates={CANDIDATES} stages={STAGES} persona="recruiter" defaultMoveMenuFor="c2" /> };
export const RejectReason: S = {
  name: 'Reject asks for a reason',
  render: () => <PipelineBoardScreen job={JOB} candidates={CANDIDATES} stages={STAGES} persona="recruiter" defaultReasonFor={{ cardId: 'c8', to: 'Rejected' }} />,
};
export const Empty: S = { name: 'Empty', render: () => <PipelineBoardScreen job={JOB} candidates={[]} stages={STAGES} persona="recruiter" /> };
export const Loading: S = { name: 'Loading', render: () => <PipelineBoardScreen job={JOB} candidates={[]} stages={STAGES} persona="recruiter" state="loading" /> };
export const Error: S = { name: 'Error', render: () => <PipelineBoardScreen job={JOB} candidates={[]} stages={STAGES} persona="recruiter" state="error" /> };

// Founder answer 261: the Bulk actions and Add candidate sheets (they replace the old candidates list). The lower-case
// exports are sample props shared with the tests.
const inHours = (h: number) => new Date(Date.parse('2026-10-14T10:00:00.000Z') + h * 3_600_000).toISOString();
export const sampleBulkRows: BulkRow[] = [
  { entryId: 'e1', name: 'Ananya Iyer', stage: 'Panel', daysInStage: 3, test: 'QA aptitude 82% · passed', scorecards: { complete: true, submitted: 2, expected: 2, score: 4.2, passes: true }, owner: 'Neha Joshi', rejectionPendingUntil: null },
  { entryId: 'e2', name: 'Vikram Reddy', stage: 'Panel', daysInStage: 9, test: 'QA aptitude 71% · passed', scorecards: { complete: false, submitted: 1, expected: 2, score: null, passes: null }, owner: null, rejectionPendingUntil: null },
  { entryId: 'e3', name: 'Arjun Kulkarni', stage: 'Rejected', daysInStage: 0, test: null, scorecards: null, owner: null, rejectionPendingUntil: inHours(23) },
];
const res = async () => ({ succeeded: 1, skipped: [] });
export const sampleBulk: BulkActionsSheetProps = {
  open: true,
  onOpenChange: () => {},
  job: JOB,
  rows: sampleBulkRows,
  statuses: STAGES.filter((s) => s !== 'Rejected').map((s) => ({ value: s, label: s })),
  exams: [{ value: 'x1', label: 'QA aptitude' }],
  templates: [{ value: 't1', label: 'Regret', subject: 'Your application', body: 'Thank you, {{candidateName}}.' }],
  senders: [],
  onOpen: () => {},
  onMove: res,
  onTest: res,
  onEmail: async () => undefined,
  onReject: async () => undefined,
  onUndo: async () => undefined,
  onExport: async () => undefined,
};
export const BulkActions: S = { name: 'Bulk actions · tick candidates, then move, test, email or reject', render: () => <BulkActionsSheet {...sampleBulk} defaultSelected={['e1', 'e2']} /> };
// Offers answer 402: with the offer-pay key, the ticked candidates go to Make bulk offers.
export const BulkActionsOffers: S = { name: 'Bulk actions · make bulk offers (offer-pay key)', render: () => <BulkActionsSheet {...sampleBulk} defaultSelected={['e1', 'e2']} onBulkOffers={() => {}} /> };
export const AddCandidate: S = { name: 'Add candidate · existing candidate', render: () => <AddCandidateSheet open onOpenChange={() => {}} job={JOB} candidates={[{ value: 'c9', label: 'Divya S · divya@example.com' }]} onAdd={async () => undefined} /> };
export const AddCandidateNew: S = { name: 'Add candidate · new candidate', render: () => <AddCandidateSheet open onOpenChange={() => {}} job={JOB} candidates={[]} onAdd={async () => undefined} defaultMode="new" /> };
