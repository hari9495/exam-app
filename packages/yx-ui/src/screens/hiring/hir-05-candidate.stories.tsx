import type { Meta, StoryObj } from '@storybook/react-vite';
import { CandidateRecordScreen, MergeDrawer, type CandidateApplication } from './hiring-pipeline';
import { CANDIDATES, D, ID_POINTS, ID_POINTS_CLEAR } from './hiring-data';
import { TODAY } from '../_kit/data';
import type { TimelineItem } from '../../components/timeline';
import { ApplicationDrawer, type ApplicationDrawerProps } from './candidate-application';

const ok = async () => ({});
const inHours = (h: number) => new Date(Date.parse('2026-10-14T10:00:00.000Z') + h * 3_600_000).toISOString();

const meta: Meta = { title: 'Screens/Hiring/HIR-05 · Candidate record', parameters: { layout: 'fullscreen' }, excludeStories: /^[a-z]/ };
export default meta;
type S = StoryObj;

const APPS: CandidateApplication[] = [
  { job: 'Senior QA Engineer · JOB-0311', stage: 'Screening', applied: D(2026, 9, 27), source: 'Careers site' },
  { job: 'Test Lead · JOB-0199', stage: 'Not selected (Mar 2026)', applied: D(2026, 2, 3), source: 'Referral' },
];
const ACT: TimelineItem[] = [
  { id: 'x1', actor: { name: 'Neha Joshi' }, action: 'moved the candidate to Screening', at: D(2026, 9, 28) },
  { id: 'x2', actor: { name: 'System' }, action: 'matched the person to a past employee record', at: D(2026, 9, 27) },
  { id: 'x3', actor: { name: 'Fatima Shaikh' }, action: 'applied through the careers site', at: D(2026, 9, 27) },
];
const EX = { exitDate: D(2024, 3, 31), exitType: 'Resignation', rehireEligible: true, company: 'Kaveri Foods' };
const EX_NO = { exitDate: D(2024, 3, 31), exitType: 'Termination after PIP', rehireEligible: false, company: 'Kaveri Foods' };
const fatima = CANDIDATES[2];
const ananya = CANDIDATES[0];

export const Recruiter: S = { name: 'Recruiter · default', render: () => <CandidateRecordScreen candidate={ananya} viewer="recruiter" identity={ID_POINTS_CLEAR} applications={APPS.slice(0, 1)} activity={ACT} now={TODAY} /> };
export const ExEmployeeRecruiter: S = { name: 'Ex-employee · recruiter sees exit details', render: () => <CandidateRecordScreen candidate={fatima} viewer="recruiter" exEmployee={EX} identity={ID_POINTS_CLEAR} applications={APPS} activity={ACT} now={TODAY} /> };
export const RehireIneligibleHr: S = { name: 'Ex-employee · rehire ineligible, HR can clear', render: () => <CandidateRecordScreen candidate={fatima} viewer="hr" exEmployee={EX_NO} identity={ID_POINTS_CLEAR} applications={APPS} activity={ACT} now={TODAY} /> };
export const ExEmployeeHiringManager: S = { name: 'Ex-employee · hiring manager sees flag only', render: () => <CandidateRecordScreen candidate={fatima} viewer="hm" exEmployee={EX_NO} identity={ID_POINTS_CLEAR} applications={APPS} activity={ACT} now={TODAY} /> };
export const Merge: S = {
  name: 'Merge duplicate · field-level choice',
  render: () => <CandidateRecordScreen candidate={ananya} viewer="recruiter" identity={ID_POINTS_CLEAR} applications={APPS.slice(0, 1)} activity={ACT} duplicate={{ ...ananya, id: 'dup', name: 'Ananya S Iyer', email: 'ananya.work@postbox.in', location: 'Coimbatore' }} mergeOpen now={TODAY} />,
};
export const MergeChooseDuplicate: S = {
  name: 'Merge with another candidate · choose the duplicate first',
  render: () => (
    <MergeDrawer
      open
      onOpenChange={() => {}}
      a={null}
      b={null}
      live={{ keptName: ananya.name, otherName: null, fields: [], pick: { options: [{ value: 'c9', label: 'Ananya S Iyer · ananya.work@postbox.in' }], value: null, onChange: () => {} }, onMerge: async () => {} }}
    />
  ),
};
export const IdentityFlag: S = { name: 'Identity review flag', render: () => <CandidateRecordScreen candidate={CANDIDATES[3]} viewer="recruiter" identity={ID_POINTS} applications={APPS.slice(0, 1)} activity={ACT} now={TODAY} /> };
export const Minor: S = {
  name: 'Under 18 · guardian consent pending',
  render: () => <CandidateRecordScreen candidate={{ ...CANDIDATES[6], name: 'Rohan Das', aiInterview: undefined }} viewer="recruiter" minor={{ dob: D(2009, 2, 14), guardianConsent: 'pending' }} identity={ID_POINTS_CLEAR.slice(0, 1)} applications={APPS.slice(0, 1)} activity={ACT} now={TODAY} />,
};
export const NoAccess: S = { name: 'No access', render: () => <CandidateRecordScreen candidate={ananya} viewer="recruiter" identity={[]} applications={[]} activity={[]} access="denied" /> };
export const NotFound: S = { name: 'Not found (anonymised)', render: () => <CandidateRecordScreen candidate={ananya} viewer="recruiter" identity={[]} applications={[]} activity={[]} access="not-found" /> };

// Founder answer 261: the application, opened on the record (a board card opens the record with it). Sample props are
// shared with the tests.
export const sampleApplication: ApplicationDrawerProps = {
  open: true,
  onClose: () => undefined,
  app: {
    entryId: 'e1', candidateId: 'c1', name: 'Priya Raman', email: 'priya@example.com', phone: '+91 98450 12345', statusId: 'st2', stageName: 'Interview', category: 'active', rejectedReason: null, rejectionPendingUntil: null,
    resume: { title: 'Process Engineer', summary: 'Six years on dairy lines.', skills: ['HACCP', 'Lean'], hasFile: true, status: 'done' },
    fit: { status: 'done', score: 81, summary: 'Strong plant background.', stale: false },
    tests: [{ examId: 'x1', title: 'Plant aptitude', score: 78, passFail: 'pass', status: 'completed' }],
    customFields: [{ label: 'Notice period', value: '30 days' }],
    currentPay: 9_60_000,
    checklist: [{ id: 'k1', label: 'References checked', done: false }],
    assignee: 'u1',
    emails: [{ id: 'm1', subject: 'Interview invitation', status: 'sent', at: inHours(-20) }],
    sms: [],
    whatsapp: [{ id: 'w1', body: 'See you tomorrow at 10.', status: 'failed', at: inHours(-2) }],
    smsOptedOut: false,
    whatsappOptedOut: false,
    notes: [{ id: 'n1', author: 'Anil', note: 'Good energy on the phone.', rating: 4, at: inHours(-48) }],
    offers: [],
  },
  canManage: true,
  statuses: [{ value: 'st1', label: 'Applied' }, { value: 'st2', label: 'Interview' }, { value: 'st3', label: 'Offer' }],
  people: [{ value: 'u1', label: 'Anil' }, { value: 'u2', label: 'Kavya' }],
  templates: [{ value: 't1', label: 'Regret', subject: 'Your application', body: 'Thank you, {{candidateName}}.' }],
  senders: [],
  smsTemplates: [],
  whatsappTemplates: [],
  surveys: [{ value: 'sv1', label: 'Candidate experience' }],
  onStatus: ok,
  onReject: ok,
  onUndo: ok,
  onAssign: ok,
  onChecklist: ok,
  onScoreFit: ok,
  onResume: ok,
  onEmail: ok,
  onSms: ok,
  onWhatsapp: ok,
  onResend: ok,
  onNote: ok,
  onSurvey: ok,
  onNewOffer: () => {},
  onOpenOffer: () => {},
};

export const Application: S = { name: 'Application · messages, notes, offers', render: () => <ApplicationDrawer {...sampleApplication} /> };
export const ApplicationOffer: S = {
  name: 'Application · an offer opens its record (HIR-09)',
  render: () => <ApplicationDrawer {...sampleApplication} app={{ ...sampleApplication.app!, offers: [{ id: 'o1', status: 'pending_approval', compensation: 'Fixed CTC ₹12,00,000 a year', startDate: '2026-12-01', expiresAt: '2026-11-15' }] }} />,
};
// Answer 502: a New York City candidate added by a recruiter; the recruiter records their request.
export const ApplicationRecordAlternative: S = { name: 'Application · record a request for another process (New York City)', render: () => <ApplicationDrawer {...sampleApplication} app={{ ...sampleApplication.app!, toolNotice: true }} onRecordAlternative={async () => {}} /> };
// Answer 474: a New York City applicant asked for another process than the automated tool.
export const ApplicationAlternative: S = { name: 'Application · asked for another process (New York City)', render: () => <ApplicationDrawer {...sampleApplication} app={{ ...sampleApplication.app!, alternativeRequestedAt: '2026-11-12T10:30:00+05:30' }} /> };
