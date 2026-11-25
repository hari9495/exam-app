// Sample records for the HLP-13 live dispute screen (stories and tests). Shapes match the API (desk/disputes).
import type { DisputeDetail, LiveDispute } from './dispute-live';

export const IRD_TODAY = '2026-11-04';
const PAPER = { id: 'f-min1', title: 'Minutes, conciliation meeting 2026-10-06', name: 'minutes-meeting-1.pdf', sha256: '9f2c4e1a7b3d5c6e8f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6', scan: 'clean' as const };
const SIGNED = { id: 'f-signed', title: 'Signed settlement', name: 'settlement-signed.pdf', sha256: '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809', scan: 'clean' as const };

export const IRD_DETAIL: DisputeDetail = {
  id: 'ird-2',
  number: 'IRD-0002',
  title: 'Charter of demands 2026',
  unionName: 'Kaveri Foods Workers Union (recognised)',
  location: 'Hosur plant',
  workersCovered: 212,
  receivedOn: '2026-06-02',
  recordedBy: 'Harish Bhat',
  stage: 'Conciliation',
  demands: [
    { id: 'd1', code: 'D1', text: 'Basic pay increase of 18 % for all categories', union: '18 %', mgmt: '11 %', status: 'agreed', agreed: '11 %' },
    { id: 'd2', code: 'D2', text: 'Night-shift allowance from ₹75 to ₹150 per shift', union: '₹150', mgmt: '₹120', status: 'agreed', agreed: '₹120' },
    { id: 'd3', code: 'D3', text: 'Transport for all shifts ending after 10 pm', union: 'All shifts', mgmt: 'Women workers only', status: 'open', agreed: null },
    { id: 'd4', code: 'D4', text: 'Two additional festival holidays', union: '2 days', mgmt: '0', status: 'open', agreed: null },
    { id: 'd5', code: 'D5', text: 'Canteen subsidy review', union: 'Full subsidy', mgmt: 'Current', status: 'withdrawn', agreed: null },
  ],
  meetings: [
    { id: 'm1', kind: 'bipartite', on: '2026-06-30', officer: null, attended: 'Union office bearers and HR-IR', minutes: 'Fourth round of bipartite talks; pay and transport still open.', paper: null, nextOn: null, by: 'Harish Bhat' },
    { id: 'm2', kind: 'conciliation', on: '2026-10-06', officer: 'Assistant Labour Commissioner, Hosur', attended: 'Union office bearers, HR-IR, Adv. Rohini Kamath', minutes: 'Pay and night-shift allowance agreed in principle.', paper: PAPER, nextOn: '2026-11-10', by: 'Harish Bhat' },
  ],
  papers: [{ ...PAPER, by: 'Harish Bhat', at: '2026-10-06T09:00:00.000Z' }],
  nextMeeting: { on: '2026-11-10', kind: 'conciliation' },
  settlement: { status: 'none', terms: null, proposedBy: null, proposedAt: null, proposedByMe: false, approvedBy: null, approvedAt: null, wageSettlementId: null, sentBack: null, canApprove: false },
  filed: null,
  closed: null,
  clocks: [
    { key: 'next', label: 'Next conciliation meeting', due: '2026-11-10', doneOn: null },
    { key: 'report', label: 'Conciliation officer’s report', due: '2026-12-05', doneOn: null },
  ],
  source: 'IN.IR.DISPUTE 2020-v1 (verify)',
  members: [
    { name: 'Harish Bhat', role: 'Industrial relations team', access: 'Full dispute record', external: false },
    { name: 'Lakshmi Venkatesan', role: 'Industrial relations team', access: 'Full dispute record', external: false },
    { name: 'Adv. Rohini Kamath', role: 'Outside lawyer', access: 'Full dispute record', external: true },
  ],
};

const TERMS = {
  kind: 'conciliation' as const,
  signedOn: '2026-11-03',
  effectiveFrom: '2026-04-01',
  effectiveTo: '2029-03-31',
  covered: 'Unskilled, semi-skilled and skilled (Hosur plant)',
  terms: 'Basic +11 %, night-shift allowance ₹120 per shift, transport for all shifts ending after 10 pm.',
  rates: [
    { category: 'skilled' as const, monthlyIncrease: '1650' },
    { category: 'semi_skilled' as const, monthlyIncrease: '1400' },
    { category: 'unskilled' as const, monthlyIncrease: '1200' },
  ],
  paper: SIGNED,
};
/** Recorded by someone else: waiting for this member's approval. */
export const IRD_PROPOSED: DisputeDetail = {
  ...IRD_DETAIL,
  stage: 'Settlement to approve',
  papers: [...IRD_DETAIL.papers, { ...SIGNED, by: 'Harish Bhat', at: '2026-11-03T10:00:00.000Z' }],
  settlement: { ...IRD_DETAIL.settlement, status: 'proposed', terms: TERMS, proposedBy: 'Harish Bhat', proposedAt: '2026-11-03T10:05:00.000Z', canApprove: true },
};
/** The proposer's own view: they wait for a second IR member. */
export const IRD_MINE: DisputeDetail = { ...IRD_PROPOSED, settlement: { ...IRD_PROPOSED.settlement, proposedBy: 'You', proposedByMe: true, canApprove: false } };
export const IRD_SENT_BACK: DisputeDetail = { ...IRD_DETAIL, settlement: { ...IRD_DETAIL.settlement, sentBack: { reason: 'The effective date should be 1 Apr 2026, as signed.', by: 'Lakshmi Venkatesan', at: '2026-11-03T11:00:00.000Z' } } };
export const IRD_APPROVED: DisputeDetail = {
  ...IRD_PROPOSED,
  stage: 'Settled, file the copy',
  settlement: { ...IRD_PROPOSED.settlement, status: 'approved', approvedBy: 'Lakshmi Venkatesan', approvedAt: '2026-11-04T05:30:00.000Z', wageSettlementId: 'ws-1', canApprove: false },
  clocks: [
    { key: 'report', label: 'Conciliation officer’s report', due: '2026-12-05', doneOn: '2026-11-03' },
    { key: 'copy', label: 'Settlement copy to the authorities', due: '2026-11-13', doneOn: null },
  ],
};
export const IRD_FILED: DisputeDetail = { ...IRD_APPROVED, stage: 'Settled, copy filed', filed: { on: '2026-11-04', ref: 'ALC/HSR/2026/118' }, clocks: IRD_APPROVED.clocks.map((c) => (c.key === 'copy' ? { ...c, doneOn: '2026-11-04' } : c)) };
export const IRD_CLOSED: DisputeDetail = { ...IRD_DETAIL, stage: 'Closed (withdrawn)', closed: { how: 'withdrawn', note: 'The union withdrew the charter after the bonus was paid.', on: '2026-11-04T06:00:00.000Z' }, clocks: [{ key: 'report', label: 'Conciliation officer’s report', due: '2026-12-05', doneOn: '2026-11-04' }] };

const ok = async () => undefined;
export const liveDispute = (over: Partial<LiveDispute> = {}): LiveDispute => ({
  state: 'ready',
  today: IRD_TODAY,
  detail: IRD_DETAIL,
  onBack: () => undefined,
  onDemand: ok,
  onDemandUpdate: ok,
  onMeeting: ok,
  onPaper: async () => ({ id: 'f-new' }),
  onOpenFile: () => undefined,
  onPropose: ok,
  onApprove: ok,
  onSendBack: ok,
  onFiled: ok,
  onClose: ok,
  ...over,
});
