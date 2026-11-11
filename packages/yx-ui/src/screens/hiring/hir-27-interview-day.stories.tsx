import type { Meta, StoryObj } from '@storybook/react-vite';
import { BulkInterviewDayScreen } from './hiring-pipeline';
import { InterviewDaySheet } from './interview-day';
import { D } from './hiring-data';
import { makeEmployees } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-27 · Bulk interview-day scheduler', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const CANDS = makeEmployees(26, 31).map((e) => e.name);
const PANELS = [
  { id: 'pa', name: 'Panel A', members: 'Prakash Menon, Deepa Das', room: 'Training room 1' },
  { id: 'pb', name: 'Panel B', members: 'Karthik Subramanian, Thomas George', room: 'Training room 2' },
  { id: 'pc', name: 'Panel C', members: 'Joseph Mathew, Sneha Rao', room: 'Board room' },
];
const SLOTS = [600, 645, 730, 815, 900, 945, 1030, 1075];
const drive = 'GET 2027 · Hosur campus';

export const Assigned: S = { name: 'Auto-assigned · ready to send', render: () => <BulkInterviewDayScreen drive={drive} date={D(2026, 10, 14)} candidates={CANDS.slice(0, 22)} panels={PANELS} slots={SLOTS} /> };
export const OverCapacity: S = { name: 'Over capacity · some unassigned', render: () => <BulkInterviewDayScreen drive={drive} date={D(2026, 10, 14)} candidates={CANDS} panels={PANELS} slots={SLOTS} /> };
export const NotAssigned: S = { name: 'Empty · not assigned yet', render: () => <BulkInterviewDayScreen drive={drive} date={D(2026, 10, 14)} candidates={CANDS.slice(0, 22)} panels={PANELS} slots={SLOTS} autoAssigned={false} /> };
export const Sent: S = { name: 'Invites sent', render: () => <BulkInterviewDayScreen drive={drive} date={D(2026, 10, 14)} candidates={CANDS.slice(0, 22)} panels={PANELS} slots={SLOTS} invitesSent /> };
// Drawn for the live page (HIR-27 build): each row's own result, the plan sheet, and no day yet.
export const SentSomeFailed: S = {
  name: 'Invites sent · some not sent',
  render: () => <BulkInterviewDayScreen drive={drive} date={D(2026, 10, 14)} candidates={CANDS.slice(0, 22)} panels={PANELS} slots={SLOTS} invitesSent failures={{ [CANDS[4]!]: 'The invite email did not go. Send again.', [CANDS[9]!]: 'No longer in the hiring process (rejected or archived).' }} />,
};
// Answer 422: two unsent candidates swap places ("Swap with…" from the keyboard, or drag one cell onto another).
export const Swap: S = { name: 'Swap two unsent candidates (422)', render: () => <BulkInterviewDayScreen drive={drive} date={D(2026, 10, 14)} candidates={CANDS.slice(0, 22)} panels={PANELS} slots={SLOTS} swapOpen={CANDS[1]!} /> };
// Answer 421: the reminder switch while WhatsApp is not connected, and each slot's reminder result once sent.
export const RemindersNotConnected: S = { name: 'WhatsApp reminders · not connected (421)', render: () => <BulkInterviewDayScreen drive={drive} date={D(2026, 10, 14)} candidates={CANDS.slice(0, 22)} panels={PANELS} slots={SLOTS} whatsapp="not-connected" /> };
export const RemindersSent: S = { name: 'WhatsApp reminders · results per slot (421)', render: () => <BulkInterviewDayScreen drive={drive} date={D(2026, 10, 14)} candidates={CANDS.slice(0, 22)} panels={PANELS} slots={SLOTS} invitesSent whatsapp="results" /> };
const JOBS = [{ value: 'j1', label: 'Graduate Engineer Trainee', stages: [{ value: 's1', label: 'Shortlisted' }, { value: 's2', label: 'Panel interview' }] }];
const PEOPLE = ['Prakash Menon', 'Deepa Das', 'Karthik Subramanian', 'Thomas George'].map((n, i) => ({ value: `u${i}`, label: n }));
export const Plan: S = {
  name: 'Plan an interview day',
  render: () => (
    <>
      <BulkInterviewDayScreen drive={drive} date={D(2026, 10, 14)} candidates={CANDS.slice(0, 22)} panels={PANELS} slots={SLOTS} autoAssigned={false} />
      <InterviewDaySheet open onOpenChange={() => {}} jobs={JOBS} people={PEOPLE} slotMinutes={45} today={D(2026, 10, 10)} onCreate={async () => {}} />
    </>
  ),
};
export const NoDays: S = {
  name: 'No interview days yet',
  render: () => <BulkInterviewDayScreen live={{ state: 'ready', onRetry: () => {}, days: [], day: null, canManage: true, onPickDay: () => {}, onPlan: () => {}, onAssign: async () => {}, onSend: async () => ({ sent: 0, failed: 0 }) }} />,
};
// Answer 423: the planner removes single slots (a lunch break); Auto-assign skips them.
const LIVE_DAY = {
  id: 'd1', name: drive, jobTitle: 'Graduate Engineer Trainee', stageName: 'Shortlisted', day: '2026-11-14', slotMinutes: 45, status: 'draft' as const, sending: false,
  slots: SLOTS.filter((s) => s !== 730),
  panels: PANELS,
  rows: CANDS.slice(0, 9).map((c, i) => ({ entryId: `e${i}`, candidate: c, panelId: PANELS[i % 3]!.id, start: SLOTS.filter((s) => s !== 730)[Math.floor(i / 3)]!, status: 'assigned' as const, error: null })),
};
export const RemoveSlot: S = {
  name: 'Remove a slot · lunch break',
  render: () => <BulkInterviewDayScreen live={{ state: 'ready', onRetry: () => {}, days: [{ value: 'd1', label: drive }], day: LIVE_DAY, canManage: true, onPickDay: () => {}, onPlan: () => {}, onAssign: async () => {}, onSend: async () => ({ sent: 0, failed: 0 }), onRemoveSlot: async () => {} }} />,
};
