// Sample `live` data for the PRC-07, PRC-21 and PRC-32 stories of the states the real pages have (AS-3), and for the
// tests. Not used by the app.
import type { LiveDriveRow, LiveInvitationRow, LiveInvitations, LiveMyTest, LivePortal, LiveReuse } from './delivery-live';
import type { CandidateBrand } from './proctoring-shared';

const ok = () => Promise.resolve();
const nothing = () => undefined;

export const LIVE_BRAND: CandidateBrand = { company: 'Kaveri Foods', candidate: 'Arjun Nair', myTestsHref: '#my-tests' };

const row = (id: string, name: string, status: LiveInvitationRow['status'], extra: Partial<LiveInvitationRow> = {}): LiveInvitationRow => ({
  id,
  candidateId: `c-${id}`,
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@example.in`,
  examId: 'e1',
  test: 'Java Backend Developer · L2',
  jobs: ['Senior Backend Developer (Chennai)'],
  drive: null,
  status,
  invitedAt: '2026-11-02T04:30:00.000Z',
  expiresAt: '2026-11-20T18:29:00.000Z',
  resendCount: 0,
  reinvitedAt: null,
  reinviteReason: null,
  extraTimePercent: 0,
  reusedAt: null,
  ...extra,
});

export const LIVE_INVITATIONS: LiveInvitationRow[] = [
  row('i1', 'Arjun Nair', 'Invited', { resendCount: 1 }),
  row('i2', 'Divya Menon', 'Started', { extraTimePercent: 25 }),
  row('i3', 'Karthik Raman', 'Completed'),
  row('i4', 'Lakshmi Iyer', 'Under review'),
  row('i5', 'Mohammed Faiz', 'Missed', { expiresAt: '2026-11-08T18:29:00.000Z' }),
  row('i6', 'Priya Sharma', 'Missed', { expiresAt: '2026-11-08T18:29:00.000Z', reinvitedAt: '2026-11-09T05:00:00.000Z', reinviteReason: 'Power cut at the college that day' }),
  row('i7', 'Ravi Kumar', 'Reused', { reusedAt: '2026-11-10T06:00:00.000Z' }),
  row('i8', 'Sneha Pillai', 'Invited', { test: 'Campus aptitude 2026', jobs: [], drive: 'Campus TN 2026 · Day 1' }),
];

export const LIVE_DRIVES: LiveDriveRow[] = [
  { id: 'd1', name: 'Campus TN 2026', tests: ['Campus aptitude 2026'], job: 'Graduate trainee', from: '2026-11-20T03:30:00.000Z', to: '2026-11-21T12:30:00.000Z', sessions: 2, invited: 412, attempted: 0, status: 'Registration open' },
  { id: 'd2', name: 'Walk-in Coimbatore', tests: ['Customer care basics'], job: null, from: '2026-10-05T03:30:00.000Z', to: '2026-10-05T12:30:00.000Z', sessions: 1, invited: 60, attempted: 54, status: 'Closed' },
];

export const liveInvitations = (o: Partial<LiveInvitations> = {}): LiveInvitations => ({
  state: 'ready',
  onRetry: nothing,
  invitations: LIVE_INVITATIONS,
  drives: LIVE_DRIVES,
  tests: [
    { id: 'e1', title: 'Java Backend Developer · L2' },
    { id: 'e2', title: 'Campus aptitude 2026' },
  ],
  candidates: [
    { id: 'c1', name: 'Anita Das', email: 'anita@example.in' },
    { id: 'c2', name: 'Bala Murugan', email: 'bala@example.in' },
  ],
  onCandidateSearch: nothing,
  onInvite: () => Promise.resolve({ created: 1, skipped: 0 }),
  onResend: ok,
  onRevoke: ok,
  onReinvite: ok,
  ...o,
});

export const MY_TESTS: LiveMyTest[] = [
  { invitationId: 'i1', testTitle: 'Java Backend Developer · L2', status: 'invited', expiresAt: '2026-11-20T18:29:00.000Z', durationMinutes: 75, extraTimePercent: 25, current: true },
  { invitationId: 'i9', testTitle: 'SQL basics', status: 'invited', expiresAt: '2026-11-25T18:29:00.000Z', durationMinutes: 30, extraTimePercent: 0, current: false },
  { invitationId: 'i10', testTitle: 'Campus aptitude 2026', status: 'under_review', expiresAt: '2026-10-01T18:29:00.000Z', durationMinutes: 90, extraTimePercent: 0, current: false },
  { invitationId: 'i11', testTitle: 'Customer care basics', status: 'missed', expiresAt: '2026-08-10T18:29:00.000Z', durationMinutes: 40, extraTimePercent: 0, current: false },
];

export const livePortal = (o: Partial<LivePortal> = {}): LivePortal => ({
  state: 'ready',
  onRetry: nothing,
  brand: LIVE_BRAND,
  tests: MY_TESTS,
  reuseOffer: false,
  onReuse: nothing,
  onStart: nothing,
  onResult: nothing,
  onOpen: ok,
  ...o,
});

export const liveReuse = (o: Partial<LiveReuse> = {}): LiveReuse => ({
  state: 'ready',
  onRetry: nothing,
  brand: LIVE_BRAND,
  testTitle: 'Java Backend Developer · L2',
  offer: { attemptId: 'a1', testTitle: 'Java Backend Developer · L2', takenAt: '2026-06-12T09:00:00.000Z', passed: true, validUntil: '2026-12-12T09:00:00.000Z', months: 6 },
  reused: null,
  onUse: ok,
  onWithdraw: ok,
  onTakeTest: nothing,
  onLater: nothing,
  ...o,
});
