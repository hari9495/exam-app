import type { Meta, StoryObj } from '@storybook/react-vite';
import { HiringCandidatesScreen, type HiringCandidatesScreenProps } from './candidates';
import { CandidateProfileScreen, type CandidateProfileScreenProps } from './profile';
import { CandidateRetentionScreen, DuplicatesScreen, TalentPoolsScreen, type CandidateRetentionScreenProps, type DuplicatesScreenProps, type TalentPoolsScreenProps } from './talent';

// Recruitment, wired (batch AT4; M10-BUILD-DESIGN §7, §13). In the affordance guard set ('screens-hiring-live').
const meta: Meta = { title: 'Screens/Hiring/Live · Candidates', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
export const list: HiringCandidatesScreenProps = {
  state: 'ready',
  rows: [
    { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', phone: '+91 98450 12345', status: 'active', globalStage: 'engaged', createdAt: '2026-09-01T00:00:00.000Z', neverInvited: false },
    { id: 'c2', name: 'Arun Kumar', email: 'arun@example.com', phone: null, status: 'active', globalStage: 'available', createdAt: '2026-08-12T00:00:00.000Z', neverInvited: true },
    { id: 'c3', name: 'Meena Iyer', email: 'meena@example.com', phone: '98400 00001', status: 'inactive', globalStage: 'rejected', createdAt: '2026-06-02T00:00:00.000Z', neverInvited: true },
  ],
  total: 3,
  page: 1,
  pageSize: 25,
  onPage: () => undefined,
  search: '',
  onSearch: () => undefined,
  status: 'active',
  onStatus: () => undefined,
  stage: null,
  onStage: () => undefined,
  canManage: true,
  customFields: [{ id: 'f1', label: 'Notice period', fieldType: 'select', options: ['Immediate', '30 days', '60 days'], required: false }],
  exams: [{ value: 'e1', label: 'Accounts aptitude' }],
  openJobs: [{ value: 'j1', label: 'Senior Accountant' }],
  lists: [{ id: 'l1', name: 'Finance talent', kind: 'pool', description: null, members: 4 }],
  templates: [{ value: 't1', label: 'Thank you', subject: 'Thank you, {{candidateName}}', body: 'Thank you for applying to {{orgName}}.' }],
  senders: [],
  duplicatesCount: 2,
  onOpen: () => undefined,
  onDuplicates: () => undefined,
  onCreate: ok,
  onUpdate: ok,
  onDelete: async () => ({ deleted: 1, skipped: 0 }),
  onInvite: async () => ({ invited: 1, skipped: 0 }),
  onUploadInvite: async () => ({ invited: 3, skipped: 1, errors: [] }),
  onDownloadTemplate: ok,
  onEmail: async () => ({ total: 1 }),
  onAddToList: async () => ({ added: 1, refused: [] }),
  onReengage: ok,
};

export const profile: CandidateProfileScreenProps = {
  state: 'ready',
  profile: {
    candidate: { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', phone: '+91 98450 12345', phoneE164: '+919845012345', status: 'active', globalStage: 'engaged', createdAt: '2026-09-01T00:00:00.000Z', erasedAt: null, emailOptedOut: false },
    legalHold: null,
    retention: { months: 12, lastActivityAt: '2026-10-01T00:00:00.000Z', until: '2027-10-01T00:00:00.000Z', noticeAt: null },
    resume: { hasFile: true, scan: 'clean', parseStatus: 'done', title: 'Senior Accountant', summary: 'Eight years in audit and GST filing.', skills: 'Tally, GST, Excel', years: 8 },
    applications: [{ id: 'a1', jobId: 'j1', jobTitle: 'Senior Accountant', jobStatus: 'open', stage: 'Interview', status: 'Scheduled', appliedAt: '2026-09-01T00:00:00.000Z', closed: false, closedReason: null, source: 'application' }],
    assessments: [{ id: 'i1', exam: 'Accounts aptitude', status: 'completed', invitedAt: '2026-09-03T00:00:00.000Z' }],
    interviews: [{ id: 'v1', status: 'confirmed', createdAt: '2026-09-10T00:00:00.000Z' }],
    messages: { emails: [{ id: 'm1', subject: 'Your interview', status: 'sent', createdAt: '2026-09-10T00:00:00.000Z' }], sms: 0, whatsapp: 1 },
    consents: [
      { id: 'k1', purpose: 'application', version: 2, source: 'apply', givenAt: '2026-09-01T00:00:00.000Z', withdrawnAt: null },
      { id: 'k2', purpose: 'talent_pool', version: 1, source: 'apply', givenAt: '2026-09-01T00:00:00.000Z', withdrawnAt: null },
    ],
    lists: [{ id: 'l1', name: 'Finance talent', kind: 'pool', addedAt: '2026-09-05T00:00:00.000Z' }],
    merges: [],
  },
  canManage: true,
  canDataRights: true,
  templates: list.templates,
  senders: [],
  mergeCandidates: [{ value: 'c9', label: 'Priya R · priya.r@example.com' }],
  loadOther: async () => ({ name: 'Priya R', phone: '98450 12345', hasResume: false }),
  onBack: () => undefined,
  onOpenJob: () => undefined,
  onResume: ok,
  onEmail: ok,
  onMerge: ok,
  onHold: ok,
  onWithdrawPool: ok,
  onErase: ok,
};

export const duplicates: DuplicatesScreenProps = {
  state: 'ready',
  pairs: [{ a: { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', phone: '98450 12345' }, b: { id: 'c9', name: 'Priya R', email: 'priya.r@example.com', phone: '+91 98450-12345' }, reasons: ['phone', 'resume'], score: 0.94 }],
  onOpen: () => undefined,
  onMerge: ok,
};

export const pools: TalentPoolsScreenProps = {
  state: 'ready',
  lists: list.lists.concat([{ id: 'l2', name: 'Cashiers this week', kind: 'hotlist', description: 'Mysuru store', members: 2 }]),
  selectedId: 'l1',
  onSelect: () => undefined,
  members: [{ candidateId: 'c1', addedAt: '2026-09-05T00:00:00.000Z', candidate: { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', globalStage: 'engaged' } }],
  canManage: true,
  onCreate: ok,
  onArchive: ok,
  onRemove: ok,
  onOpenCandidate: () => undefined,
};

export const retention: CandidateRetentionScreenProps = {
  state: 'ready',
  months: '12',
  monthsOptions: ['6', '9', '12', '18', '24', '36'],
  canChange: true,
  onMonths: ok,
  runs: [{ id: 'r1', runAt: '2026-10-12T21:45:00.000Z', periodMonths: 12, renewalsSent: 3, anonymised: 7, skippedHold: 1, skippedOpen: 2, skippedHired: 4, triggeredBy: null }],
  onPreview: async () => ({ periodMonths: 12, renewalsSent: 2, anonymised: 1, skippedHold: 1, skippedOpen: 0, skippedHired: 3 }),
  onRun: async () => ({ periodMonths: 12, renewalsSent: 2, anonymised: 1, skippedHold: 1, skippedOpen: 0, skippedHired: 3 }),
};

export const Candidates: S = { render: () => <HiringCandidatesScreen {...list} /> };
export const NoCandidates: S = { render: () => <HiringCandidatesScreen {...list} rows={[]} total={0} /> };
export const Profile: S = { render: () => <CandidateProfileScreen {...profile} /> };
export const ProfileOnHold: S = { render: () => <CandidateProfileScreen {...profile} profile={{ ...profile.profile!, legalHold: { at: '2026-10-01T00:00:00.000Z', reason: 'Labour court case 12/2026' } }} /> };
export const Duplicates: S = { render: () => <DuplicatesScreen {...duplicates} /> };
export const Pools: S = { render: () => <TalentPoolsScreen {...pools} /> };
export const Retention: S = { render: () => <CandidateRetentionScreen {...retention} /> };
