import type { Meta, StoryObj } from '@storybook/react-vite';
import { CaseListScreen, CaseWorkspaceScreen, ErrorCase, LoadingCase } from './cases';
import { ANON_MESSAGES, CASES } from './helpdesk-data';
import { ANON_MEMBERS, CASE_DOCUMENTS, CASE_TIMELINE, DISC_MEMBERS, GRIEVANCE_MEMBERS } from './cases-data';
import { TODAY } from '../_kit/data';

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
