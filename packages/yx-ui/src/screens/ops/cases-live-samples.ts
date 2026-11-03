// Sample records in the shapes the case screens need (cases-live-types.ts), for the HLP-07/08/09 live stories and
// tests. Fictional Kaveri Foods people, the same as cases-data.ts. Today is 29 Sep 2026.
import type { LiveCaseList, LiveCaseWorkspace, LiveEthicsDesk, LiveMyCases } from './cases-live';
import type { CaseDetail, CaseFile, CaseListRow, EthicsRow, MyCaseAsReporter, MyCaseAsRespondent, MyCaseRow } from './cases-live-types';

const noop = async () => undefined;
export const CASE_TODAY = '2026-09-29';

const file = (id: string, name: string, addedBy: string, addedAt: string, over: Partial<CaseFile> = {}): CaseFile => ({
  id,
  name,
  size: 184_000,
  type: 'application/pdf',
  scan: 'clean',
  addedBy,
  addedAt,
  sha256: `9f2c4a71e0b3${id.padEnd(6, '0')}d84e1c0f5a7b2e93c6d1048f7a2b5c9e0d3f6a18b4c7e2d5f9a0b3c6d`,
  opens: 2,
  ...over,
});

/* ---------------- HLP-07 ---------------- */

export const MY_CASE_ROWS: MyCaseRow[] = [
  { id: 'c1', ref: 'GRV-0142', kind: 'grievance', role: 'reporter', stage: 'Inquiry', status: 'open', next: { label: 'Committee decision', on: '2026-10-12' }, unread: 1 },
  { id: 'c2', ref: 'POSH-0007', kind: 'posh', role: 'respondent', stage: 'Notice sent', status: 'action', next: { label: 'Your reply due', on: '2026-10-04' }, unread: 0 },
  { id: 'c3', ref: 'GRV-0098', kind: 'grievance', role: 'witness', stage: 'Closed', status: 'closed', next: null, unread: 0 },
];

export function reporterCase(over: Partial<MyCaseAsReporter> = {}): MyCaseAsReporter {
  return {
    id: 'c1',
    ref: 'GRV-0142',
    kind: 'grievance',
    role: 'reporter',
    stage: 'Inquiry',
    status: 'open',
    openedOn: '2026-09-12',
    dates: [
      { key: 'ack', label: 'Acknowledged', due: '2026-09-14', doneOn: '2026-09-13' },
      { key: 'decision', label: 'Committee decision', due: '2026-10-12', doneOn: null },
      { key: 'appeal', label: 'Appeal, if you disagree', due: null, doneOn: null, note: 'Opens after the decision' },
    ],
    datesSource: 'Company grievance setting: 30 days to decide',
    messages: [
      { id: 'm1', at: '2026-09-13T05:30:00Z', from: 'team', who: 'Geetha Ramesh', text: 'We have your grievance. The committee meets on 16 Sep. You can write to us here.' },
      { id: 'm2', at: '2026-09-14T09:10:00Z', from: 'me', who: null, text: 'Thank you. The bus was late again on 15 Sep.' },
    ],
    outcome: null,
    appealUntil: null,
    ...over,
  };
}

export function respondentCase(over: Partial<MyCaseAsRespondent> = {}): MyCaseAsRespondent {
  return {
    id: 'c2',
    ref: 'POSH-0007',
    kind: 'posh',
    role: 'respondent',
    stage: 'Notice sent',
    status: 'action',
    openedOn: '2026-09-21',
    dates: [
      { key: 'notice', label: 'Notice sent to you', due: '2026-09-28', doneOn: '2026-09-24' },
      { key: 'reply', label: 'Your reply', due: '2026-10-04', doneOn: null },
    ],
    datesSource: 'POSH rules 2013, rule 7 · company rule set v2013-12 (verify with counsel)',
    messages: [],
    notice: {
      sentOn: '2026-09-24',
      replyBy: '2026-10-04',
      replySource: 'POSH rules 2013, rule 7(4): 10 days',
      allegations: 'Remarks of a sexual nature to a colleague in team meetings on 3, 10 and 17 Sep 2026.',
      files: [file('f1', 'Copy of the complaint.pdf', 'Dr. Anuradha Menon', '2026-09-24'), file('f2', 'List of witnesses and papers.pdf', 'Dr. Anuradha Menon', '2026-09-24')],
      moreTime: null,
      askedMoreTime: false,
      replies: [],
    },
    outcome: null,
    appealUntil: null,
    ...over,
  };
}

export function liveMyCases(over: Partial<LiveMyCases> = {}): LiveMyCases {
  return {
    state: 'ready',
    today: CASE_TODAY,
    cases: MY_CASE_ROWS,
    openId: null,
    onOpen: () => undefined,
    detail: null,
    onSendMessage: noop,
    onReply: noop,
    onAskMoreTime: noop,
    onUpload: async () => ({ id: 'u1' }),
    onOpenFile: () => undefined,
    onSpeakUp: () => undefined,
    ...over,
  };
}

/* ---------------- HLP-08 ---------------- */

export const CASE_LIST_ROWS: CaseListRow[] = [
  { id: 'k1', ref: 'GRV-0142', kind: 'grievance', subject: 'Night-shift bus does not wait at the gate', location: 'Hosur plant', stage: 'Inquiry', raisedBy: 'Farzana Begum', anonymous: false, owner: 'Lakshmi Venkatesan', next: { label: 'Committee decision', on: '2026-10-12' }, overdue: false, status: 'open' },
  { id: 'k2', ref: 'WB-0011', kind: 'whistleblower', subject: 'Supplier gifts above the ₹2,000 limit', location: 'Bengaluru head office', stage: 'Outcome proposed', raisedBy: null, anonymous: true, owner: 'Rekha Iyengar', next: { label: 'Second officer approves', on: null }, overdue: false, status: 'action' },
  { id: 'k3', ref: 'POSH-0007', kind: 'posh', subject: 'Complaint about remarks in team meetings', location: 'Bengaluru head office', stage: 'Notice sent', raisedBy: 'Withheld', anonymous: false, owner: 'Dr. Anuradha Menon', next: { label: 'Reply due', on: '2026-10-04' }, overdue: false, status: 'open' },
  { id: 'k4', ref: 'GRV-0140', kind: 'grievance', subject: 'A manager: shift changed without notice', location: 'Hosur plant', stage: 'Notice and reply', raisedBy: 'Ravi Shankar', anonymous: false, owner: 'Lakshmi Venkatesan', next: { label: 'Reply due', on: '2026-09-30' }, overdue: false, status: 'open' },
  { id: 'k5', ref: 'GRV-0139', kind: 'grievance', subject: 'Canteen water not safe to drink', location: 'Chennai office', stage: 'Decision', raisedBy: 'Arun P.', anonymous: false, owner: 'Lakshmi Venkatesan', next: { label: 'Committee decision', on: '2026-09-25' }, overdue: true, status: 'open' },
];

export function liveCaseList(over: Partial<LiveCaseList> = {}): LiveCaseList {
  return { state: 'ready', cases: CASE_LIST_ROWS, onOpen: () => undefined, ...over };
}

/** An ethics case: one officer proposed, the viewer is the second officer. */
export function ethicsCase(over: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: 'k2',
    ref: 'WB-0011',
    kind: 'whistleblower',
    subject: 'Supplier gifts above the ₹2,000 limit',
    location: 'Bengaluru head office',
    openedOn: '2026-08-27',
    stage: 'Outcome proposed',
    stages: ['Received', 'Acknowledged', 'Inquiry', 'Notice and reply', 'Outcome', 'Closed'],
    stageIndex: 4,
    status: 'action',
    version: 7,
    owner: 'Rekha Iyengar',
    reporter: null,
    anonymous: true,
    respondent: 'Suresh Nair (Purchase manager)',
    dates: [
      { key: 'ack', label: 'Acknowledge to reporter', due: '2026-09-03', doneOn: '2026-08-28' },
      { key: 'reply', label: 'Respondent reply', due: '2026-09-22', doneOn: '2026-09-20' },
      { key: 'outcome', label: 'Outcome', due: '2026-10-27', doneOn: null },
    ],
    datesSource: 'Company vigil policy: 60 days to an outcome',
    me: { memberId: 'mb-joseph', canWork: true, canApprove: true, ic: false, presiding: false, recused: false },
    canDecide: { ok: true, reason: null },
    members: [
      { id: 'mb-rekha', name: 'Rekha Iyengar', role: 'Case officer (owner)', access: 'full', recused: null },
      { id: 'mb-joseph', name: 'Joseph Mathew', role: 'Second officer', access: 'full', recused: null },
      { id: 'mb-sn', name: 'Justice (retd.) S. Narayanan', role: 'Audit committee chair', access: 'reports and outcome', external: true, recused: null },
    ],
    people: [
      { id: 'p-harish', name: 'Harish Bhat', email: 'harish.bhat@kaverifoods.in' },
      { id: 'p-ravi', name: 'Ravi Shankar', email: 'ravi.shankar@kaverifoods.in' },
      { id: 'p-lakshmi', name: 'Lakshmi Venkatesan', email: 'lakshmi.v@kaverifoods.in' },
    ],
    report: { summary: 'Four festival hampers from a packaging vendor reached the purchase team around 14 Aug. Two looked well above the gifts limit.', category: 'Bribery or corruption', happenedOn: '2026-08-14', involved: 'Purchase manager', witnesses: null, outside: 'Sri Lakshmi Packaging (vendor)', retaliationWorry: true, late: false },
    timeline: [
      { id: 't1', at: '2026-08-27T10:00:00Z', who: 'YukthiX', text: 'Report received through Speak-up (anonymous). Routed to the ethics officers.' },
      { id: 't2', at: '2026-08-28T05:00:00Z', who: 'Rekha Iyengar', text: 'Acknowledged to the reporter' },
      { id: 't3', at: '2026-09-12T06:30:00Z', who: 'Rekha Iyengar', text: 'Sent the notice to the respondent' },
      { id: 't4', at: '2026-09-20T11:15:00Z', who: 'Suresh Nair', text: 'Replied to the notice' },
      { id: 't5', at: '2026-09-27T09:00:00Z', who: 'Rekha Iyengar', text: 'Proposed the outcome' },
    ],
    files: [
      file('e1', 'Gifts register Jul–Aug.xlsx', 'Rekha Iyengar', '2026-09-02', { type: 'application/vnd.ms-excel', opens: 4 }),
      file('e2', 'Vendor email 14 Aug.pdf', 'Rekha Iyengar', '2026-09-02', { opens: 3 }),
      file('e3', 'Photo of hamper.jpg', 'Anonymous reporter', '2026-09-28', { type: 'image/jpeg', scan: 'pending', opens: 0 }),
    ],
    accessLog: [
      { id: 'a1', at: '2026-09-28T04:40:00Z', who: 'Joseph Mathew', what: 'Opened the case' },
      { id: 'a2', at: '2026-09-27T09:02:00Z', who: 'Rekha Iyengar', what: 'Opened Gifts register Jul–Aug.xlsx' },
      { id: 'a3', at: '2026-09-26T07:15:00Z', who: 'Justice (retd.) S. Narayanan', what: 'Read the report' },
    ],
    messages: [
      { id: 'am1', at: '2026-08-28T05:00:00Z', from: 'team', who: 'Rekha Iyengar', text: 'Thank you for the report. Can you tell us roughly when the hampers arrived?' },
      { id: 'am2', at: '2026-08-30T15:20:00Z', from: 'reporter', who: null, text: 'Around 14 August, before Independence Day. There were four of them.' },
    ],
    notice: {
      status: 'sent',
      delay: null,
      sentOn: '2026-09-12',
      replyBy: '2026-09-22',
      replySource: 'Company vigil policy: 10 days',
      replies: [{ at: '2026-09-20T11:15:00Z', text: 'The hampers were festival gifts sent to the whole team. I did not ask for them and declared one in the register.', files: [] }],
      moreTime: null,
    },
    outcome: {
      status: 'proposed',
      finding: 'proved-in-part',
      action: 'Written warning; gifts training for the purchase team',
      reasons: 'Two of the four hampers were above the limit and not declared. The register shows one declared on 16 Aug.',
      reporterSummary: 'We looked into your concern and took action with the purchase team.',
      proposedBy: 'Rekha Iyengar',
      proposedByMe: false,
      proposedAt: '2026-09-27',
      approvedBy: null,
      approvedAt: null,
      sendBackNote: null,
    },
    icReport: null,
    relief: [],
    ...over,
  };
}

/** A POSH case held by the Internal Committee; the viewer is the presiding officer. */
export function poshCase(over: Partial<CaseDetail> = {}): CaseDetail {
  const base = ethicsCase();
  return {
    ...base,
    id: 'k3',
    ref: 'POSH-0007',
    kind: 'posh',
    subject: 'Complaint about remarks in team meetings',
    openedOn: '2026-09-21',
    stage: 'Inquiry',
    stages: ['Filed', 'Notice to respondent', 'Inquiry and hearings', 'IC report', 'Employer action', 'Appeal window', 'Closed'],
    stageIndex: 2,
    status: 'open',
    owner: 'Dr. Anuradha Menon',
    reporter: 'Priya Sharma',
    anonymous: false,
    respondent: 'Vikram Rao (Senior manager, Sales)',
    dates: [
      { key: 'notice', label: 'Notice to respondent', due: '2026-09-28', doneOn: '2026-09-24' },
      { key: 'reply', label: 'Respondent reply', due: '2026-10-04', doneOn: null },
      { key: 'inquiry', label: 'Inquiry complete', due: '2026-12-20', doneOn: null },
      { key: 'report', label: 'IC report to employer', due: null, doneOn: null, note: 'Starts when the inquiry ends' },
    ],
    datesSource: 'POSH rules 2013 · company rule set v2013-12 (verify with counsel)',
    me: { memberId: 'ic-anuradha', canWork: true, canApprove: false, ic: true, presiding: true, recused: false },
    canDecide: { ok: false, reason: 'The report waits for the respondent’s reply or the reply date (4 Oct 2026).' },
    members: [
      { id: 'ic-anuradha', name: 'Dr. Anuradha Menon', role: 'IC member', access: 'full', presiding: true, recused: null },
      { id: 'ic-kavitha', name: 'Kavitha Srinivasan', role: 'IC member', access: 'full', recused: null },
      { id: 'ic-joseph', name: 'Joseph Mathew', role: 'IC member', access: 'full', recused: { on: '2026-09-22', reason: 'Works in the same team as the respondent.' } },
      { id: 'ic-shobha', name: 'Adv. Shobha Rao', role: 'IC member (external)', access: 'full', external: true, recused: null },
    ],
    people: base.people,
    report: { summary: 'Remarks of a sexual nature to me in team meetings on 3, 10 and 17 Sep 2026.', category: null, happenedOn: '2026-09-17', involved: 'My manager in Sales', witnesses: 'Two colleagues in the meeting', outside: null, retaliationWorry: false, late: false },
    timeline: [
      { id: 'p1', at: '2026-09-21T12:35:00Z', who: 'Complainant', text: 'Filed the complaint' },
      { id: 'p2', at: '2026-09-22T04:30:00Z', who: 'Joseph Mathew', text: 'Stepped aside: works in the same team as the respondent' },
      { id: 'p3', at: '2026-09-24T11:00:00Z', who: 'Dr. Anuradha Menon', text: 'Sent the notice and a copy of the complaint to the respondent' },
    ],
    messages: [],
    notice: { status: 'sent', delay: null, sentOn: '2026-09-24', replyBy: '2026-10-04', replySource: 'POSH rules 2013, rule 7(4): 10 days', replies: [], moreTime: null },
    outcome: null,
    icReport: { status: 'none', finding: null, findings: null, recommendation: null, votes: [], signedBy: null, signedOn: null },
    relief: [],
    ...over,
  };
}

const VOTES = [
  { memberId: 'ic-anuradha', name: 'Dr. Anuradha Menon', presiding: true },
  { memberId: 'ic-kavitha', name: 'Kavitha Srinivasan', presiding: false },
  { memberId: 'ic-shobha', name: 'Adv. Shobha Rao', presiding: false },
];
export function icReport(agree: number, signed = false): CaseDetail['icReport'] {
  return {
    status: signed ? 'signed' : 'draft',
    finding: 'proved-in-part',
    findings: 'The remarks on 3 and 17 Sep are proved by two witnesses and the meeting notes. The remark on 10 Sep is not proved.',
    recommendation: 'Written warning to the respondent; move the complainant to another reporting line if she asks.',
    votes: VOTES.map((v, i) => ({ ...v, vote: i < agree ? 'agree' : null, note: null, at: i < agree ? '2026-10-15' : null })),
    signedBy: signed ? 'Dr. Anuradha Menon' : null,
    signedOn: signed ? '2026-10-16' : null,
  };
}

export function liveWorkspace(over: Partial<LiveCaseWorkspace> = {}): LiveCaseWorkspace {
  return {
    state: 'ready',
    today: CASE_TODAY,
    detail: ethicsCase(),
    onBack: () => undefined,
    onSendNotice: noop,
    onDelayNotice: noop,
    onDecideMoreTime: noop,
    onPropose: noop,
    onApprove: noop,
    onSendBack: noop,
    onSaveIcReport: noop,
    onVote: noop,
    onSign: noop,
    onRelief: async () => ({ taskRef: 'POSH-0007-R1' }),
    onReliefDone: noop,
    onRecuse: noop,
    onAddMember: noop,
    onUpload: noop,
    onOpenFile: () => undefined,
    onSendMessage: noop,
    ...over,
  };
}

/* ---------------- HLP-09 ---------------- */

export const ETHICS_ROWS: EthicsRow[] = [
  { id: 'w1', ref: 'WB-0012', subject: 'Overtime register altered at Hosur', receivedOn: '2026-09-27', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', anonymous: true, severity: 'serious', routed: false, stage: 'Received', clock: { label: 'Acknowledge by', on: '2026-10-04' }, aboutOfficer: false },
  { id: 'w2', ref: 'WB-0011', subject: 'Supplier gifts above the ₹2,000 limit', receivedOn: '2026-08-27', entity: 'Kaveri Foods Pvt Ltd', anonymous: true, severity: 'standard', routed: false, stage: 'Outcome proposed', clock: { label: 'Outcome by', on: '2026-10-27' }, aboutOfficer: false },
  { id: 'w3', ref: 'WB-0010', subject: 'Case officer approved own travel claims', receivedOn: '2026-09-19', entity: 'Kaveri Foods Pvt Ltd', anonymous: false, severity: 'serious', routed: true, stage: 'Inquiry', clock: null, aboutOfficer: true },
  { id: 'w4', ref: 'WB-0009', subject: 'Vendor invoices approved without delivery', receivedOn: '2026-09-03', entity: 'Kaveri Foods Pvt Ltd', anonymous: true, severity: 'serious', routed: true, stage: 'Inquiry', clock: null, aboutOfficer: false },
];

export function liveEthics(over: Partial<LiveEthicsDesk> = {}): LiveEthicsDesk {
  return { state: 'ready', rows: ETHICS_ROWS, onOpen: () => undefined, onRoute: noop, ...over };
}
