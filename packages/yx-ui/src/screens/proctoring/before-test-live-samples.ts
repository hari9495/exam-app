// Sample `live` data for the PRC-10, PRC-11 and PRC-23 stories of the states the real requests have (AS-4b), and for
// the tests. Not used by the app.
import type { AccommodationView, CandidateHelpView, ConnectivityView, LiveAccommodationQueue, LiveAccommodationRequest, LiveConnectivity } from './before-test-live';

const ok = () => Promise.resolve();

export const ACC_ROWS: AccommodationView[] = [
  { id: 'r1', candidateName: 'Deepa Pillai', test: 'Java Backend Developer · L2', kinds: ['time', 'reader'], extraTimePercent: 25, note: 'Low vision; I use NVDA.', evidenceName: 'Doctor letter.pdf', status: 'pending', approvedKinds: [], grantedExtraTimePercent: null, message: null, createdAt: '2026-11-14T06:30:00.000Z', decidedAt: null, decidedBy: null, started: false },
  { id: 'r2', candidateName: 'Karthik Krishnan', test: 'Campus aptitude 2026', kinds: ['time', 'separate'], extraTimePercent: 50, note: null, evidenceName: null, status: 'pending', approvedKinds: [], grantedExtraTimePercent: null, message: null, createdAt: '2026-11-15T06:30:00.000Z', decidedAt: null, decidedBy: null, started: true },
];

export const ACC_DECIDED: AccommodationView[] = [
  { ...ACC_ROWS[0]!, id: 'r3', status: 'partly', approvedKinds: ['reader'], decidedAt: '2026-11-15T09:30:00.000Z', decidedBy: 'Meera Iyer', message: 'Screen-reader mode approved; extra time is not needed for this test.' },
];

export function liveAccommodations(over: Partial<LiveAccommodationQueue> = {}): LiveAccommodationQueue {
  return { state: 'ready', onRetry: () => {}, tab: 'pending', onTab: () => {}, rows: ACC_ROWS, onOpenEvidence: ok, onDecide: ok, ...over };
}

export const CONNECTIVITY_ROWS: ConnectivityView[] = [
  { id: 'c1', attemptId: 'a1', candidateName: 'Ananya Rao', test: 'Campus aptitude 2026', lostMs: 535_000, creditedMs: 600_000, capMinutes: 10, status: 'pending', attemptStatus: 'in_progress', startedAt: '2026-11-16T04:32:00.000Z', reason: null, decidedBy: null, decidedAt: null, updatedAt: '2026-11-16T05:00:00.000Z' },
  { id: 'c2', attemptId: 'a2', candidateName: 'Tarun Joshi', test: 'Campus aptitude 2026', lostMs: 135_000, creditedMs: 600_000, capMinutes: 10, status: 'pending', attemptStatus: 'submitted', startedAt: '2026-11-16T04:30:00.000Z', reason: null, decidedBy: null, decidedAt: null, updatedAt: '2026-11-16T05:10:00.000Z' },
];

export function liveConnectivity(over: Partial<LiveConnectivity> = {}): LiveConnectivity {
  return { state: 'ready', onRetry: () => {}, rows: CONNECTIVITY_ROWS, onApprove: ok, onDecline: ok, ...over };
}

export const HELP_WAITING: CandidateHelpView = {
  request: { kinds: ['time', 'reader'], extraTimePercent: 25, status: 'pending', approvedKinds: [], grantedExtraTimePercent: null, message: null, createdAt: '2026-11-14T06:30:00.000Z', decidedAt: null },
  approved: [],
  extraTimePercent: 0,
};
export const HELP_APPROVED: CandidateHelpView = {
  request: { ...HELP_WAITING.request!, status: 'approved', approvedKinds: ['time', 'reader'], grantedExtraTimePercent: 50, message: 'We approved 50 % extra time and screen-reader mode.', decidedAt: '2026-11-15T09:30:00.000Z' },
  approved: ['time', 'reader'],
  extraTimePercent: 50,
};

export function liveRequest(over: Partial<LiveAccommodationRequest> = {}): LiveAccommodationRequest {
  return { state: 'ready', onRetry: () => {}, testTitle: 'Java Backend Developer · L2', durationMinutes: 75, started: false, help: { request: null, approved: [], extraTimePercent: 0 }, onSend: ok, onBack: () => {}, ...over };
}
