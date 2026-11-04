import type { Meta, StoryObj } from '@storybook/react-vite';
import { CollectiveDisputeScreen } from './cases-more';
import { CONCILIATION, DEMANDS } from './cases-data';
import { TODAY } from '../_kit/data';
import { CaseListScreen } from './cases';
import { SpeakUpSetupScreen } from './helpdesk-speakup-live';
import { liveCaseList, CASE_LIST_ROWS } from './cases-live-samples';
import { liveSetup } from './helpdesk-speakup-live-samples';
import { IRD_APPROVED, IRD_CLOSED, IRD_FILED, IRD_MINE, IRD_PROPOSED, IRD_SENT_BACK, liveDispute } from './dispute-live-samples';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-13 · Collective dispute / settlement', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const members = [
  { name: 'Harish Bhat', role: 'IR lead (owner)', access: 'full' },
  { name: 'Lakshmi Venkatesan', role: 'HR', access: 'full' },
  { name: 'Adv. Rohini Kamath', role: 'Legal counsel', access: 'full', external: true },
];

export const Conciliation: S = { name: 'Conciliation in progress', render: () => <CollectiveDisputeScreen demands={DEMANDS} stages={CONCILIATION} members={members} today={TODAY} /> };
export const Signed: S = { name: 'Settlement signed · send to payroll arrears', render: () => <CollectiveDisputeScreen demands={DEMANDS} stages={CONCILIATION} members={members} today={TODAY} stage="signed" /> };
export const NonMember: S = { name: 'Not a case member (shows Not found)', render: () => <CollectiveDisputeScreen demands={DEMANDS} stages={CONCILIATION} members={members} today={TODAY} member={false} /> };

// States only the real record has, drawn in the same look (the live screen with sample records).
const disputeRow = { id: 'ird-2', ref: 'IRD-0002', kind: 'dispute' as const, subject: 'Charter of demands 2026', location: 'Hosur plant', stage: 'Conciliation', raisedBy: 'Kaveri Foods Workers Union', anonymous: false, owner: 'Industrial relations team', next: { label: 'Next conciliation meeting', on: '2026-11-10' }, overdue: false, status: 'open' as const };
const record = { locations: [{ id: 'hsr', name: 'Hosur plant' }, { id: 'maa', name: 'Chennai office' }], onRecord: async () => ({ id: 'ird-3', number: 'IRD-0003' }) };
export const InCases: S = { name: 'In the Cases list (IR team)', render: () => <CaseListScreen live={liveCaseList({ cases: [disputeRow, ...CASE_LIST_ROWS.slice(0, 3)], dispute: record })} /> };
export const RecordDispute: S = { name: 'Record a dispute', render: () => <CaseListScreen live={liveCaseList({ cases: [disputeRow], dispute: record, start: { recording: true } })} /> };
const registered = { ...record, locations: [{ id: 'hsr', name: 'Hosur plant', unions: [{ id: 'un-kfwu', name: 'Kaveri Foods Workers Union' }, { id: 'un-hsr', name: 'Hosur Plant Staff Union' }] }] };
export const RecordDisputeRegister: S = { name: 'Record a dispute · union from payroll’s register', render: () => <CaseListScreen live={liveCaseList({ cases: [disputeRow], dispute: registered, start: { recording: true } })} /> };
export const AddDemand: S = { name: 'Add a demand', render: () => <CollectiveDisputeScreen live={liveDispute({ start: { dialog: 'demand' } })} /> };
export const UpdateDemand: S = { name: 'Demand agreed or withdrawn', render: () => <CollectiveDisputeScreen live={liveDispute({ start: { dialog: 'demand-update', demandId: 'd3' } })} /> };
export const LogMeeting: S = { name: 'Log a meeting (minutes fingerprinted)', render: () => <CollectiveDisputeScreen live={liveDispute({ start: { tab: 'meetings', dialog: 'meeting' } })} /> };
export const RecordSettlement: S = { name: 'Record settlement (signed copy, pay terms)', render: () => <CollectiveDisputeScreen live={liveDispute({ start: { tab: 'settlement', dialog: 'settlement' } })} /> };
export const ToApprove: S = { name: 'Settlement · second IR member approves', render: () => <CollectiveDisputeScreen live={liveDispute({ detail: IRD_PROPOSED })} /> };
export const ProposerWaits: S = { name: 'Settlement · the recorder waits (can’t approve)', render: () => <CollectiveDisputeScreen live={liveDispute({ detail: IRD_MINE })} /> };
export const SentBack: S = { name: 'Settlement sent back', render: () => <CollectiveDisputeScreen live={liveDispute({ detail: IRD_SENT_BACK, start: { tab: 'settlement' } })} /> };
export const SentToPayroll: S = { name: 'Approved · sent to payroll arrears', render: () => <CollectiveDisputeScreen live={liveDispute({ detail: IRD_APPROVED })} /> };
export const CopyFiled: S = { name: 'Copy filed with the authorities', render: () => <CollectiveDisputeScreen live={liveDispute({ detail: IRD_FILED })} /> };
export const Closed: S = { name: 'Closed without a settlement', render: () => <CollectiveDisputeScreen live={liveDispute({ detail: IRD_CLOSED })} /> };
export const CloseDispute: S = { name: 'Close without a settlement (dialog)', render: () => <CollectiveDisputeScreen live={liveDispute({ start: { dialog: 'close' } })} /> };
export const IrTeam: S = { name: 'Speak-up set-up · Industrial relations team', render: () => <SpeakUpSetupScreen live={liveSetup({ start: { adding: 'ir' } })} /> };
