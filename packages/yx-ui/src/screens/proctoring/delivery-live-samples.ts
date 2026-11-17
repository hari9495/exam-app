// Sample `live` data for the PRC-07, PRC-21 and PRC-32 stories of the states the real pages have (AS-3), and for the

// tests. Not used by the app.

import { DEFAULT_CAMPUS_SETTINGS, type LiveCampusKit, type LiveCoordinator, type LiveDriveRow, type LiveInstitution, type LiveInvitationRow, type LiveInvitations, type LiveMyTest, type LivePortal, type LiveRegistrant, type LiveReuse } from './delivery-live';

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

  onResend: (ids) => Promise.resolve({ done: ids.length, failed: [] }),

  onRevoke: (ids) => Promise.resolve({ done: ids.length, failed: [] }),

  onReinvite: ok,

  onNewDrive: () => Promise.resolve('d9'),

  onOpenDrive: nothing,

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


/* ---------------------------------------------------------------- PRC-29 campus kit (AS-3 part 2) */

export const LIVE_INSTITUTIONS: LiveInstitution[] = [
  { id: 'n1', name: 'Coromandel Institute of Technology', code: 'CIT-TN-014', city: 'Chennai', coordinatorName: 'Dr. Latha Ramesh', coordinatorEmail: 'latha@cit.example.in', resultsVisibility: 'aggregate', archived: false },
  { id: 'n2', name: 'Kongu Valley Engineering College', code: 'KVEC-TN-022', city: 'Erode', coordinatorName: null, coordinatorEmail: null, resultsVisibility: 'none', archived: false },
  { id: 'n3', name: 'Palar Polytechnic', code: 'PP-TN-040', city: 'Vellore', coordinatorName: 'Mr. Ashok Babu', coordinatorEmail: 'ashok@pp.example.in', resultsVisibility: 'per_candidate', archived: true },
];

const reg = (id: string, name: string, extra: Partial<LiveRegistrant> = {}): LiveRegistrant => ({
  id,
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@student.example.in`,
  phone: '9876543210',
  institutionId: 'n1',
  college: 'Coromandel Institute of Technology',
  rollNumber: `21CS${id.slice(1)}`,
  branch: 'CSE',
  graduationYear: 2027,
  cgpa: 7.8,
  eligible: true,
  ineligibleReason: null,
  match: 'New',
  duplicateOf: null,
  mergedInto: null,
  test: 'Invited',
  registeredAt: '2026-11-10T05:00:00.000Z',
  ...extra,
});

export const LIVE_REGISTRANTS: LiveRegistrant[] = [
  reg('r140', 'Arjun Nair'),
  reg('r141', 'Divya Menon', { match: 'Existing candidate', test: 'Completed' }),
  reg('r142', 'Karthik Raman', { cgpa: 5.9, eligible: false, ineligibleReason: 'CGPA below 6.5', test: null }),
  reg('r143', 'Lakshmi Iyer', { institutionId: 'n2', college: 'Kongu Valley Engineering College', branch: 'IT' }),
  reg('r144', 'Lakshmi I', { rollNumber: '21CS143', institutionId: 'n2', college: 'Kongu Valley Engineering College', match: 'Possible duplicate', duplicateOf: { id: 'r143', name: 'Lakshmi Iyer', email: 'lakshmi@student.example.in' } }),
];

export const liveCampus = (o: Partial<LiveCampusKit> = {}): LiveCampusKit => ({
  state: 'ready',
  onRetry: nothing,
  drive: { id: 'd1', name: 'Campus drive · Tamil Nadu 2026', status: 'Registration open', tests: ['Campus aptitude 2026'] },
  registrationUrl: 'https://kaverifoods.example.in/walk-in/kaveri?group=d1',
  settings: { ...DEFAULT_CAMPUS_SETTINGS, branches: ['CSE', 'IT', 'ECE'], graduationYear: 2027, minCgpa: 6.5, cap: 6000 },
  registrants: LIVE_REGISTRANTS,
  report: [
    { institutionId: 'n1', college: 'Coromandel Institute of Technology', registered: 1240, eligible: 1102, invited: 1102, attended: 0, passed: 0 },
    { institutionId: 'n2', college: 'Kongu Valley Engineering College', registered: 980, eligible: 860, invited: 860, attended: 0, passed: 0 },
    { institutionId: 'n3', college: 'Palar Polytechnic', registered: 3, eligible: 2, invited: 2, attended: 0, passed: 0 },
  ],
  institutions: LIVE_INSTITUTIONS,
  onSaveSettings: ok,
  onSaveInstitution: ok,
  onImportInstitutions: (_csv: string, commit: boolean) =>
    Promise.resolve({
      rows: [
        { line: 2, name: 'Vaigai College of Engineering', code: 'VCE-31', ok: true, problem: null },
        { line: 3, name: 'Coromandel Institute of Technology', code: 'CIT-TN-014', ok: false, problem: 'The code CIT-TN-014 is already in the list.' },
      ],
      added: commit ? 1 : 0,
    }),
  onSendCoordinatorLink: () => Promise.resolve('latha@cit.example.in'),
  onMerge: ok,
  onNotDuplicate: ok,
  onCopyLink: ok,
  ...o,
});

export const liveCoordinator = (o: Partial<LiveCoordinator> = {}, view: Partial<NonNullable<LiveCoordinator['view']>> = {}): LiveCoordinator => ({
  state: 'ready',
  view: {
    company: 'Kaveri Foods',
    drive: 'Campus drive · Tamil Nadu 2026',
    college: 'Coromandel Institute of Technology',
    coordinator: 'Dr. Latha Ramesh',
    visibility: 'aggregate',
    resultsShown: false,
    registrationUrl: 'https://kaverifoods.example.in/walk-in/kaveri?group=d1&college=CIT-TN-014',
    counts: { registered: 1240, eligible: 1102, invited: 1102, attended: 0, passed: null },
    registrants: [
      { name: 'Arjun Nair', rollNumber: '21CS140', registration: 'Eligible', test: 'Invited', result: null },
      { name: 'Karthik Raman', rollNumber: '21CS142', registration: 'Not eligible', test: 'Not invited', result: null },
    ],
    ...view,
  },
  onCopyLink: ok,
  ...o,
});
