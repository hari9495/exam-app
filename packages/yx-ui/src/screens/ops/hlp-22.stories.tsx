import type { Meta, StoryObj } from '@storybook/react-vite';
import { play, press } from '../_kit/story-play';
import { TODAY } from '../_kit/data';
import { ChangeRecordScreen, ChangesScreen, NewChangeDrawer, ProblemRecordScreen, ProblemsScreen, type ChangeRow, type ProblemRow } from './hlp-22-itsm';
import { OpsDesk } from './ops-kit';

// Helpdesk HLP-22 · Changes and problems: a DRAFT for the founder's questions 1931 to 1943 (helpdesk plan item 5, ITSM
// change and problem management; docs/yukthix/helpdesk-itsm-plan.md). Not live yet.
const meta: Meta = { title: 'Screens/Helpdesk/HLP-22 · Changes and problems', component: ChangesScreen, subcomponents: { ChangeRecordScreen, ProblemsScreen, ProblemRecordScreen }, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m);
const CHANGES: ChangeRow[] = [
  { id: 'c1', number: 'CHG-14', title: 'Upgrade the Hosur attendance devices to firmware 4.2', kind: 'normal', risk: 'high', state: 'approval', service: 'Attendance devices', owner: 'Imran Sheikh', from: at(30, 20), to: at(30, 23), incidents: 2 },
  { id: 'c2', number: 'CHG-15', title: 'Monthly laptop patching', kind: 'standard', risk: 'low', state: 'scheduled', service: 'Laptops', owner: 'Farah Khan', from: at(30, 21), to: at(30, 23, 30), incidents: 0, clash: 'CHG-14 and CHG-15 both run on 30 Sep from 9 pm on the Hosur network.' },
  { id: 'c3', number: 'CHG-12', title: 'Replace the core switch at the Chennai office', kind: 'normal', risk: 'medium', state: 'review', service: 'Wi-Fi', owner: 'Imran Sheikh', from: at(26, 21), to: at(26, 23), incidents: 3 },
  { id: 'c4', number: 'CHG-16', title: 'Restore email routing after the certificate expired', kind: 'emergency', risk: 'high', state: 'closed', service: 'Email', owner: 'Suresh Pillai', from: at(28, 11), to: at(28, 11, 40), incidents: 14 },
];
const FREEZES = [
  { on: new Date(2026, 9, 1), why: 'payroll days (1st to 7th)' },
  { on: new Date(2026, 9, 7), why: 'statutory due date (TDS)' },
];
const PROBLEMS: ProblemRow[] = [
  { id: 'p1', number: 'PRB-4', title: 'Attendance devices at Hosur stop syncing overnight', state: 'known_error', incidents: 6, owner: 'Imran Sheikh', openedOn: new Date(2026, 8, 12), cause: 'Firmware 4.1 drops the connection when the network renews its address after midnight.' },
  { id: 'p2', number: 'PRB-5', title: 'VPN disconnects on Fridays', state: 'investigating', incidents: 4, owner: 'Farah Khan', openedOn: new Date(2026, 8, 22), cause: null },
  { id: 'p3', number: 'PRB-3', title: 'Printer queue stuck after Windows update', state: 'fixed', incidents: 9, owner: 'Suresh Pillai', openedOn: new Date(2026, 7, 30), cause: 'A spooler setting reset by the update.' },
];
const STEPS = [
  { id: 'a1', label: 'IT lead', status: 'done' as const, approver: 'Suresh Pillai', at: at(29, 9, 10) },
  { id: 'a2', label: 'Change board (majority of 4)', status: 'current' as const, approver: 'Arjun Kulkarni, Divya Menon, Farah Khan, Meena Iyer' },
];
const TASKS = [
  { id: 't1', title: 'Save the firmware 4.1 image of each device', done: true },
  { id: 't2', title: 'Update the 12 devices, one gate at a time', done: false },
  { id: 't3', title: 'Check a punch on each gate', done: false },
];
const ACCESS_LINKS = [
  { number: 'IT-1031', subject: 'Gate 2 device did not sync punches', kind: 'incident' as const },
  { number: 'PRB-4', subject: 'Attendance devices at Hosur stop syncing overnight', kind: 'problem' as const },
];

export const Changes: S = { name: 'Changes · list, clash and the change calendar', render: () => <ChangesScreen rows={CHANGES} freezes={FREEZES} today={TODAY} /> };
export const ChangesEmpty: S = { name: 'Changes · none yet', render: () => <ChangesScreen rows={[]} freezes={[]} today={TODAY} /> };
export const NewChange: S = { name: 'New change · kind, risk questions, window, way back', render: () => <ChangesScreen rows={CHANGES} freezes={FREEZES} today={TODAY} newOpen /> };
export const NewChangeTooEarly: S = { name: 'New change · sent with nothing filled', render: () => <ChangesScreen rows={CHANGES} freezes={FREEZES} today={TODAY} newOpen />, play: play(press('Send for approval')) };
export const NewEmergency: S = {
  name: 'New change · emergency, one approver now',
  render: () => (
    <OpsDesk area="helpdesk" active="Tickets">
      <NewChangeDrawer onClose={() => undefined} defaultKind="emergency" />
    </OpsDesk>
  ),
};
export const WaitingForApproval: S = { name: 'A change · waiting for the change board (high risk)', render: () => <ChangeRecordScreen change={CHANGES[0]!} stage="approval" approvals={STEPS} tasks={TASKS} linkedFrom={ACCESS_LINKS} now={TODAY} /> };
export const ScheduledClash: S = { name: 'A change · scheduled, clashes with another', render: () => <ChangeRecordScreen change={CHANGES[1]!} stage="scheduled" approvals={[{ id: 'a0', label: 'Pre-approved template', status: 'done', approver: 'Monthly laptop patching' }]} tasks={TASKS} now={TODAY} /> };
export const InProgress: S = { name: 'A change · in progress, the checklist and the outcome', render: () => <ChangeRecordScreen change={{ ...CHANGES[0]!, state: 'in_progress' }} stage="in_progress" approvals={STEPS.map((s) => ({ ...s, status: 'done' as const, at: at(29, 15) }))} tasks={TASKS} linkedFrom={ACCESS_LINKS} now={TODAY} /> };
export const Review: S = {
  name: 'A change · review after it caused incidents',
  render: () => <ChangeRecordScreen change={{ ...CHANGES[2]!, state: 'review' }} stage="review" approvals={[{ id: 'a1', label: 'IT lead', status: 'done', approver: 'Suresh Pillai', at: at(24, 10) }, { id: 'a2', label: 'Service owner', status: 'done', approver: 'Meena Iyer', at: at(24, 16) }]} tasks={TASKS.map((t) => ({ ...t, done: true }))} causedIncidents={[{ number: 'IT-1040', subject: 'No Wi-Fi on the 2nd floor' }, { number: 'IT-1041', subject: 'Printer offline' }, { number: 'IT-1043', subject: 'VoIP phones cannot register' }]} now={TODAY} />,
};
export const Problems: S = { name: 'Problems · list, a repeat suggested', render: () => <ProblemsScreen rows={PROBLEMS} /> };
export const ProblemInvestigating: S = { name: 'A problem · linked incidents, cause not found yet', render: () => <ProblemRecordScreen problem={PROBLEMS[1]!} incidents={[{ number: 'IT-1012', subject: 'VPN dropped during a call', state: 'Solved', raisedOn: new Date(2026, 8, 4) }, { number: 'IT-1020', subject: 'VPN disconnects every hour', state: 'Solved', raisedOn: new Date(2026, 8, 11) }, { number: 'IT-1033', subject: 'Cannot stay on the VPN', state: 'Open', raisedOn: new Date(2026, 8, 25) }]} workaround="" /> };
export const KnownError: S = {
  name: 'A problem · known error, workaround to the knowledge base, fix by change',
  render: () => <ProblemRecordScreen problem={PROBLEMS[0]!} knownError incidents={[{ number: 'IT-1009', subject: 'Gate 1 punches missing', state: 'Solved', raisedOn: new Date(2026, 8, 3) }, { number: 'IT-1031', subject: 'Gate 2 device did not sync punches', state: 'Open', raisedOn: new Date(2026, 8, 21) }]} workaround="Restart the device from its menu (Settings › Network › Reconnect) after midnight; the punches sync within 5 minutes." fixChange={{ number: 'CHG-14', title: 'Upgrade the Hosur attendance devices to firmware 4.2', state: 'approval' }} />,
};
export const NoAccess: S = { name: 'No access (not on the IT desk)', render: () => <ChangesScreen rows={[]} freezes={[]} today={TODAY} access={false} /> };
