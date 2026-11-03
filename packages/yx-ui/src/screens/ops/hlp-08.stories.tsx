import type { Meta, StoryObj } from '@storybook/react-vite';
import { CaseListScreen, CaseWorkspaceScreen, ErrorCase, LoadingCase } from './cases';
import { ANON_MESSAGES, CASES } from './helpdesk-data';
import { ANON_MEMBERS, CASE_DOCUMENTS, CASE_TIMELINE, DISC_MEMBERS, GRIEVANCE_MEMBERS } from './cases-data';
import { TODAY } from '../_kit/data';
import type { LiveCaseWorkspace } from './cases-live';
import { ethicsCase, icReport, liveWorkspace, poshCase } from './cases-live-samples';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-08 · Cases (case team)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const common = { timeline: CASE_TIMELINE, documents: CASE_DOCUMENTS, today: TODAY };

export const CaseList: S = { name: 'Case list', render: () => <CaseListScreen cases={CASES} today={TODAY} /> };
export const CaseListEmpty: S = { name: 'Case list · empty', render: () => <CaseListScreen cases={[]} today={TODAY} state="empty" /> };
export const Grievance: S = { name: 'Grievance workspace (GRC, disposal clock)', render: () => <CaseWorkspaceScreen variant="grievance" caseRow={CASES[0]} members={GRIEVANCE_MEMBERS} {...common} /> };
export const AnonymousMessages: S = { name: 'Whistleblower · anonymous messages', render: () => <CaseWorkspaceScreen variant="anonymous" caseRow={CASES[3]} members={ANON_MEMBERS} messages={ANON_MESSAGES} {...common} /> };
export const Disciplinary: S = { name: 'Disciplinary · reply awaited', render: () => <CaseWorkspaceScreen variant="disciplinary" caseRow={CASES[2]} members={DISC_MEMBERS} {...common} tab="misconduct" /> };
export const DecisionBlocked: S = { name: 'Disciplinary · decision blocked before reply', render: () => <CaseWorkspaceScreen variant="disciplinary" caseRow={CASES[2]} members={DISC_MEMBERS} {...common} decisionOpen /> };
export const DecisionAllowed: S = { name: 'Disciplinary · record decision', render: () => <CaseWorkspaceScreen variant="disciplinary" caseRow={CASES[2]} members={DISC_MEMBERS} {...common} decisionOpen replyReceived /> };
export const ConflictBlock: S = { name: 'Add member · conflict of interest', render: () => <CaseWorkspaceScreen variant="grievance" caseRow={CASES[0]} members={GRIEVANCE_MEMBERS} {...common} addMemberConflict /> };
export const NonMember: S = { name: 'Not a case member (shows Not found)', render: () => <CaseWorkspaceScreen variant="grievance" caseRow={CASES[0]} members={[]} {...common} member={false} /> };
export const NonMemberList: S = { name: 'Case list · not a member (shows Not found)', render: () => <CaseListScreen cases={CASES} today={TODAY} member={false} /> };
export const Loading: S = { render: () => <LoadingCase /> };
export const Error: S = { render: () => <ErrorCase /> };

// States only the real records have (Helpdesk design wiring, HLP-08 live), drawn in the same layout as above.
const live = (over: Partial<LiveCaseWorkspace> = {}) => <CaseWorkspaceScreen live={liveWorkspace(over)} />;
const ethics = ethicsCase();
const notSent = { ...ethics.notice!, status: 'not-sent' as const, sentOn: null, replyBy: null, replies: [] };
const noOutcome = { ...ethics.outcome!, status: 'none' as const, finding: null, action: null, reasons: null, proposedBy: null, proposedAt: null };
export const SecondOfficer: S = { name: 'Outcome · second officer approves or sends back', render: () => live({ start: { tab: 'decision' } }) };
export const ProposedByMe: S = { name: 'Outcome · proposer waits for a second officer', render: () => live({ detail: ethicsCase({ outcome: { ...ethics.outcome!, proposedByMe: true }, me: { ...ethics.me, canApprove: false } }), start: { tab: 'decision' } }) };
export const ProposeOutcome: S = { name: 'Outcome · propose (finding, action, reasons)', render: () => live({ detail: ethicsCase({ stage: 'Notice and reply', stageIndex: 3, outcome: noOutcome }), start: { dialog: 'propose' } }) };
export const IcFindings: S = { name: "POSH · IC findings and members' views (1 of 3 agree)", render: () => live({ detail: poshCase({ canDecide: { ok: true, reason: null }, icReport: icReport(1) }), start: { tab: 'decision' } }) };
export const IcSigned: S = { name: 'POSH · IC report signed by the presiding officer', render: () => live({ detail: poshCase({ stage: 'Employer action', stageIndex: 4, canDecide: { ok: true, reason: null }, icReport: icReport(3, true) }), start: { tab: 'decision' } }) };
export const NoticeToSend: S = { name: 'Notice · not sent yet (send or delay)', render: () => live({ detail: ethicsCase({ notice: notSent, outcome: noOutcome }), start: { tab: 'notice' } }) };
export const NoticeDelayed: S = {
  name: 'Notice · delayed with a recorded reason',
  render: () => live({ detail: ethicsCase({ notice: { ...notSent, status: 'delayed', delay: { reason: 'The respondent approves the reporter’s leave; telling him now could expose the reporter.', reviewOn: '2026-10-06', by: 'Rekha Iyengar', at: '2026-09-25' } }, outcome: noOutcome }), start: { tab: 'notice' } }),
};
export const SendNotice: S = { name: 'Notice · choose the respondent, what is alleged, the papers', render: () => live({ detail: ethicsCase({ respondent: null, notice: notSent, outcome: noOutcome }), start: { tab: 'notice', dialog: 'notice' } }) };
export const DelayNotice: S = { name: 'Notice · delay (reason and review date)', render: () => live({ detail: ethicsCase({ notice: notSent, outcome: noOutcome }), start: { tab: 'notice', dialog: 'delay' } }) };
export const MoreTimeDecide: S = {
  name: 'Notice · the respondent asked for more time',
  render: () => live({ detail: poshCase({ notice: { ...poshCase().notice!, moreTime: { reason: 'I am travelling for a customer audit until 5 Oct.', askedOn: '2026-09-27', status: 'waiting', newDue: null } } }), start: { tab: 'notice' } }),
};
export const InterimRelief: S = {
  name: 'Interim relief · recorded, HR task',
  render: () => live({ detail: poshCase({ relief: [{ id: 'r1', action: 'reporting', note: 'Priya Sharma reports to Kavya N. instead of the respondent, as she asked in writing on 23 Sep.', by: 'Dr. Anuradha Menon', at: '2026-09-24', task: { ref: 'POSH-0007-R1', status: 'open', assignee: 'Lakshmi Venkatesan (HR)' } }] }), start: { tab: 'relief' } }),
};
export const RecordRelief: S = { name: 'Interim relief · record (gives HR a task)', render: () => live({ detail: poshCase(), start: { tab: 'relief', dialog: 'relief' } }) };
export const StepAside: S = { name: 'Step aside from a case (with a reason)', render: () => live({ detail: poshCase(), start: { dialog: 'recuse' } }) };
export const ConflictOverride: S = { name: 'Add member · conflict found, override with a reason', render: () => live({ start: { dialog: 'add', conflict: 'Ravi Shankar is in the respondent’s manager chain.' } }) };
export const Evidence: S = { name: 'Evidence · fingerprints, virus check and access log', render: () => live({ start: { tab: 'evidence' } }) };
export const Severity: S = { name: 'Ethics report · the ethics officer sets Serious or Standard', render: () => live({ detail: ethicsCase({ severity: 'standard' }) }) };
export const NoAccess: S = { name: 'No access (no case-team key)', render: () => live({ state: 'no-access' }) };
