import type { Meta, StoryObj } from '@storybook/react-vite';
import { CandidateRecordScreen, type CandidateApplication } from './hiring-pipeline';
import { CANDIDATES, D, ID_POINTS, ID_POINTS_CLEAR } from './hiring-data';
import { TODAY } from '../_kit/data';
import type { TimelineItem } from '../../components/timeline';

const meta: Meta = { title: 'Screens/Hiring/HIR-05 · Candidate record', parameters: { layout: 'fullscreen' } };
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
const EX = { exitDate: D(2024, 3, 31), exitType: 'Resignation', rehireEligible: true };
const EX_NO = { exitDate: D(2024, 3, 31), exitType: 'Termination after PIP', rehireEligible: false };
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
export const IdentityFlag: S = { name: 'Identity review flag', render: () => <CandidateRecordScreen candidate={CANDIDATES[3]} viewer="recruiter" identity={ID_POINTS} applications={APPS.slice(0, 1)} activity={ACT} now={TODAY} /> };
export const Minor: S = {
  name: 'Under 18 · guardian consent pending',
  render: () => <CandidateRecordScreen candidate={{ ...CANDIDATES[6], name: 'Rohan Das', aiInterview: undefined }} viewer="recruiter" minor={{ dob: D(2009, 2, 14), guardianConsent: 'pending' }} identity={ID_POINTS_CLEAR.slice(0, 1)} applications={APPS.slice(0, 1)} activity={ACT} now={TODAY} />,
};
export const NoAccess: S = { name: 'No access', render: () => <CandidateRecordScreen candidate={ananya} viewer="recruiter" identity={[]} applications={[]} activity={[]} access="denied" /> };
export const NotFound: S = { name: 'Not found (anonymised)', render: () => <CandidateRecordScreen candidate={ananya} viewer="recruiter" identity={[]} applications={[]} activity={[]} access="not-found" /> };
