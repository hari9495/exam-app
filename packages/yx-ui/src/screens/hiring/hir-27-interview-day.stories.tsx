import type { Meta, StoryObj } from '@storybook/react-vite';
import { BulkInterviewDayScreen } from './hiring-pipeline';
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
