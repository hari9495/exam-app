import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyCasesScreen } from './cases';
import { MY_CASES, SHOW_CAUSE } from './cases-data';
import { TODAY } from '../_kit/data';
import type { LiveMyCases } from './cases-live';
import { liveMyCases, reporterCase, respondentCase, showCauseCase } from './cases-live-samples';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-07 · My cases', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const base = { cases: MY_CASES, showCause: SHOW_CAUSE, today: TODAY };

export const List: S = { name: 'My cases (complainant, respondent, witness)', render: () => <MyCasesScreen {...base} /> };
export const ShowCauseReply: S = { name: 'Show-cause reply', render: () => <MyCasesScreen {...base} replyOpen /> };
export const ExtensionAsked: S = { name: 'Show-cause · extension requested', render: () => <MyCasesScreen {...base} replyOpen extensionRequested /> };
export const Replied: S = { name: 'Reply sent', render: () => <MyCasesScreen {...base} replied /> };
export const Empty: S = { render: () => <MyCasesScreen {...base} cases={[]} state="empty" /> };
export const Loading: S = { render: () => <MyCasesScreen {...base} state="loading" /> };
export const Phone: S = { name: 'My cases · phone', globals: PHONE, render: () => <MyCasesScreen {...base} device="phone" /> };
export const PhoneReply: S = { name: 'Show-cause reply · phone', globals: PHONE, render: () => <MyCasesScreen {...base} device="phone" replyOpen /> };

// States only the real records have (Helpdesk design wiring, HLP-07 live), drawn in the same layout as above.
const live = (over: Partial<LiveMyCases> = {}) => <MyCasesScreen live={liveMyCases(over)} />;
export const ReporterView: S = { name: 'Reporter · status, dates and messages only', render: () => live({ openId: 'c1', detail: reporterCase() }) };
export const OutcomeShared: S = {
  name: 'Reporter · closed, the outcome and the appeal date',
  render: () => live({ openId: 'c1', detail: reporterCase({ status: 'closed', stage: 'Closed with actions', outcome: 'The committee found the bus timings were not kept. The transport vendor now waits 15 minutes after each shift.', appealUntil: '2026-12-28' }) }),
};
export const RespondentNotice: S = { name: 'Respondent · notice, copy of the complaint, reply date', render: () => live({ openId: 'c2', detail: respondentCase() }) };
export const MoreTimeAsked: S = {
  name: 'Respondent · more time asked, waiting for the case team',
  render: () => live({ openId: 'c2', detail: respondentCase({ notice: { ...respondentCase().notice, askedMoreTime: true, moreTime: { reason: 'I am travelling for a customer audit until 5 Oct.', askedOn: '2026-09-27', status: 'waiting', newDue: null } } }) }),
};
export const ShowCauseLive: S = { name: 'Show-cause notice (disciplinary) · rule, facts, reply date', render: () => live({ cases: [{ id: 'c4', ref: 'DSC-0031', kind: 'disciplinary', role: 'respondent', stage: 'Show-cause notice', status: 'action', next: { label: 'Your reply due', on: '2026-09-30' }, unread: 0 }], openId: 'c4', detail: showCauseCase() }) };
export const NoAccess: S = { name: 'No access (acting for someone else)', render: () => live({ state: 'no-access' }) };
