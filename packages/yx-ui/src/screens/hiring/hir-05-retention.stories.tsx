import type { Meta, StoryObj } from '@storybook/react-vite';
import { CandidateRetentionScreen } from './hiring-candidates';
import type { RetentionRunRow } from './live/types';

// HIR-05 Retention (founder decision 9): candidate data retention and DPDP data requests, drawn from the kit, then
// wired to /yx/hiring/retention. The lower-case exports are sample data shared with the tests, not stories.
const meta: Meta = { title: 'Screens/Hiring/HIR-05 · Candidate data retention', parameters: { layout: 'fullscreen' }, excludeStories: /^[a-z]/ };
export default meta;
type S = StoryObj;

export const sampleRuns: RetentionRunRow[] = [
  { id: 'r2', runAt: '2026-11-08T21:45:00.000Z', periodMonths: 12, renewalsSent: 3, anonymised: 7, skippedHold: 1, skippedOpen: 2, skippedHired: 4, triggeredBy: null },
  { id: 'r1', runAt: '2026-11-02T06:10:00.000Z', periodMonths: 12, renewalsSent: 1, anonymised: 0, skippedHold: 1, skippedOpen: 1, skippedHired: 4, triggeredBy: 'u1' },
];
const base = { months: '12', monthsOptions: ['6', '9', '12', '18', '24', '36'], runs: sampleRuns };
const PREVIEW = { periodMonths: 12, renewalsSent: 2, anonymised: 1, skippedHold: 1, skippedOpen: 0, skippedHired: 3 };
export const sampleFound = { id: 'c3', name: 'Fatima Shaikh', email: 'fatima.s@mailbox.in', stage: 'in_review' as const, onHold: false, erased: false };

export const Default: S = { name: 'HR · default', render: () => <CandidateRetentionScreen {...base} /> };
export const Preview: S = { name: 'Preview · changes nothing', render: () => <CandidateRetentionScreen {...base} preview={PREVIEW} /> };
export const RequestFound: S = { name: 'Data request · person found', render: () => <CandidateRetentionScreen {...base} found={sampleFound} /> };
export const RequestOnHold: S = { name: 'Data request · on legal hold, no erase', render: () => <CandidateRetentionScreen {...base} found={{ ...sampleFound, onHold: true }} /> };
export const RequestNobody: S = { name: 'Data request · nobody with that email', render: () => <CandidateRetentionScreen {...base} found={null} /> };
export const PeriodReadOnly: S = { name: 'Period · no settings key', render: () => <CandidateRetentionScreen {...base} canChange={false} /> };
export const NoRuns: S = { name: 'First use · no runs yet', render: () => <CandidateRetentionScreen {...base} runs={[]} /> };
export const Loading: S = { name: 'Loading', render: () => <CandidateRetentionScreen {...base} state="loading" /> };
export const NoAccess: S = { name: 'No access · no data-rights key', render: () => <CandidateRetentionScreen {...base} state="denied" /> };
