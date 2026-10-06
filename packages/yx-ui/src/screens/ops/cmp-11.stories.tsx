import type { Meta, StoryObj } from '@storybook/react-vite';
import { PoshCaseScreen } from './posh';
import { POSH_TIMELINE } from './cases-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Compliance/CMP-11 · POSH case workspace', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const members = [
  { name: 'Dr. Anuradha Menon', role: 'Presiding officer', access: 'full' },
  { name: 'Adv. Shobha Rao', role: 'External member', access: 'full', external: true },
  { name: 'Kavitha Srinivasan', role: 'Member', access: 'full' },
  { name: 'Joseph Mathew', role: 'Member', blocked: 'Conflict: same team as respondent' },
];

export const NoticeDue: S = { name: 'Notice to respondent due', render: () => <PoshCaseScreen caseId="POSH-0007" filed={new Date(2026, 8, 21)} today={TODAY} members={members} timeline={POSH_TIMELINE} /> };
export const InquiryEscalation: S = { name: 'Inquiry near 90 days (escalated)', render: () => <PoshCaseScreen caseId="POSH-0006" filed={new Date(2026, 6, 10)} today={TODAY} members={members} timeline={POSH_TIMELINE} done={{ notice: new Date(2026, 6, 15) }} tab="hearings" /> };
export const EmployerAction: S = { name: 'IC report sent · employer action due', render: () => <PoshCaseScreen caseId="POSH-0005" filed={new Date(2026, 4, 2)} today={TODAY} members={members} timeline={POSH_TIMELINE} done={{ notice: new Date(2026, 4, 6), inquiry: new Date(2026, 6, 20), report: new Date(2026, 6, 28) }} tab="report" /> };
export const Conciliation: S = { name: 'Conciliation requested', render: () => <PoshCaseScreen caseId="POSH-0008" filed={new Date(2026, 8, 27)} today={TODAY} members={members} timeline={POSH_TIMELINE} conciliation /> };
export const NotMember: S = { name: 'Not on the case (shows Not found)', render: () => <PoshCaseScreen caseId="POSH-0007" filed={new Date(2026, 8, 21)} today={TODAY} members={members} timeline={[]} member={false} /> };
