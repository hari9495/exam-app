import '../components/timeline.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { ActivityFeed, ApprovalTimeline, CommentThread, Timeline, type ActivityEntry, type ApprovalStep, type Comment, type TimelineItem } from '../components/timeline';
import { Badge } from '../components/display';

const meta: Meta = { title: 'Time and activity/Timelines and comments', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

// Fixed "now": Tue 29 Sep 2026, 11:00 am.
const NOW = new Date(2026, 8, 29, 11, 0);
const t = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m);
const panel = (el: ReactElement) => <div style={{ maxWidth: 420 }}>{el}</div>;

/* Timeline */
const ITEMS: TimelineItem[] = [
  { id: '1', actor: { name: 'Sana Nizami' }, action: 'approved the leave request for 05 Oct – 09 Oct 2026', at: t(29, 10, 12) },
  { id: '2', actor: { name: 'Karthik Subramanian' }, action: 'applied for 5 days of earned leave', at: t(29, 9, 3) },
  { id: '3', actor: { name: 'Arjun Kulkarni' }, action: 'changed the shift for 06 Oct 2026 from Morning to Night', at: t(28, 17, 40) },
  { id: '4', actor: { name: 'Divya Raghunathan' }, action: 'published the Hosur plant roster for 05 Oct – 11 Oct 2026', at: t(28, 16, 5) },
  { id: '5', actor: { name: 'Imran Qureshi' }, action: 'regularised a missing check-out on 24 Sep 2026', at: t(25, 18, 22) },
  {
    id: '6',
    actor: { name: 'Venkata Subrahmanya Lakshminarayana Ramachandran' },
    action: 'added a long note to the attendance exception explaining that the biometric device at Gate 2 was offline between 6 am and 9 am',
    at: t(25, 9, 45),
  },
];
export const ActivityTimeline: S = { name: 'Timeline', render: () => panel(<Timeline items={ITEMS} today={NOW} />) };

/* Approval timeline */
const IN_PROGRESS: ApprovalStep[] = [
  { id: 's', label: 'Submitted', status: 'done', approver: 'Karthik Subramanian', at: t(28, 9, 3) },
  { id: 'm', label: 'Manager approval', status: 'done', approver: 'Sana Nizami', at: t(28, 11, 18), comment: 'Fine by me. Please hand over the release checklist to Meera.' },
  { id: 'h', label: 'HR review', status: 'current', approver: 'Imran Qureshi' },
  { id: 'p', label: 'Payroll', status: 'pending', approver: 'Payroll team' },
];
const REJECTED: ApprovalStep[] = [
  { id: 's', label: 'Submitted', status: 'done', approver: 'Rohit Bhat', at: t(24, 14, 30) },
  { id: 'm', label: 'Manager approval', status: 'skipped', approver: 'Not needed under ₹10,000', at: t(24, 14, 30) },
  { id: 'f', label: 'Finance review', status: 'rejected', approver: 'Lakshmi Venkatesan', at: t(26, 10, 5), comment: 'The hotel bill is missing a GST number. Add the GST invoice and submit again.' },
  { id: 'p', label: 'Payroll', status: 'skipped' },
];
export const ApprovalInProgress: S = { name: 'Approval, in progress', render: () => panel(<ApprovalTimeline steps={IN_PROGRESS} now={NOW} />) };
export const ApprovalRejectedSkipped: S = { name: 'Approval, rejected and skipped steps', render: () => panel(<ApprovalTimeline steps={REJECTED} now={NOW} />) };

/* Activity feed */
const FEED: ActivityEntry[] = [
  {
    id: 'a1',
    kind: 'change',
    actor: { name: 'Imran Qureshi' },
    at: t(29, 10, 40),
    text: 'updated job details',
    changes: [
      { field: 'Department', from: 'Operations', to: 'Quality' },
      { field: 'Manager', from: 'Prakash Menon', to: 'Deepa Rao' },
      { field: 'Monthly CTC', from: '₹58,000', to: '₹64,200' },
    ],
  },
  { id: 'a2', kind: 'comment', actor: { name: 'Deepa Rao' }, at: t(29, 10, 5), text: 'commented: "Welcome to the quality team. Induction is on Thursday."' },
  { id: 'a3', kind: 'approval', actor: { name: 'Sana Nizami' }, at: t(28, 15, 20), text: <>approved the transfer <Badge tone="success">Approved</Badge></> },
  { id: 'a4', kind: 'change', actor: null, at: t(28, 0, 5), text: 'set the probation end date from the policy', changes: [{ field: 'Probation ends', to: '31 Mar 2027' }] },
  { id: 'a5', kind: 'change', actor: null, at: t(27, 23, 0), text: 'synced the bank account from the payroll import', changes: [{ field: 'IFSC', from: 'HDFC0001234', to: 'ICIC0004321' }] },
];
function FeedDemo({ entries = FEED, defaultFilter }: { entries?: ActivityEntry[]; defaultFilter?: 'all' | 'change' | 'comment' | 'approval' }) {
  const [loading, setLoading] = useState(false);
  return panel(<ActivityFeed entries={entries} defaultFilter={defaultFilter} today={NOW} hasMore onLoadOlder={() => setLoading(true)} loadingOlder={loading} />);
}
export const Feed: S = { name: 'Activity feed with changes', render: () => <FeedDemo /> };
export const FeedApprovals: S = { name: 'Activity feed, approvals only', render: () => <FeedDemo defaultFilter="approval" /> };
export const FeedFilteredEmpty: S = { name: 'Activity feed, filter with no results', render: () => <FeedDemo entries={FEED.filter((e) => e.kind !== 'comment')} defaultFilter="comment" /> };

/* Comments */
const ME = { id: 'e1', name: 'Imran Qureshi' };
const PEOPLE = [
  { id: 'e1', name: 'Imran Qureshi', role: 'HR Executive' },
  { id: 'e2', name: 'Prakash Menon', role: 'Plant Supervisor' },
  { id: 'e3', name: 'Priya Nair', role: 'Payroll Executive' },
  { id: 'e4', name: 'Deepa Rao', role: 'Quality Manager' },
  { id: 'e5', name: 'Pradeep Das', role: 'Shift Lead' },
];
const COMMENTS: Comment[] = [
  { id: 'c1', author: { id: 'e2', name: 'Prakash Menon' }, body: 'Arjun worked the Dussehra holiday shift. @[Priya Nair](e3) can you add the holiday OT for October?', at: t(28, 16, 10) },
  {
    id: 'c2',
    author: { id: 'e3', name: 'Priya Nair' },
    body: 'Added. It will show on the October payslip as holiday overtime at 2×.',
    at: t(28, 17, 2),
    editedAt: t(28, 17, 9),
    attachments: [{ name: 'OT-register-Oct-2026.xlsx', size: 48_230 }],
  },
  { id: 'c3', author: ME, body: 'Thanks. Closing this once the payslip is out.', at: t(29, 10, 52) },
];
const PRIVATE: Comment = {
  id: 'c4',
  author: ME,
  body: 'Arjun has had three late marks this month. Discussed with @[Prakash Menon](e2); no action for now.',
  at: t(29, 10, 55),
  private: true,
};

export const Thread: S = { name: 'Comment thread', render: () => panel(<CommentThread currentUser={ME} people={PEOPLE} defaultComments={COMMENTS} now={NOW} />) };
export const MentionsOpen: S = {
  name: 'Comment thread, mention list open',
  render: () => panel(<CommentThread currentUser={ME} people={PEOPLE} defaultComments={COMMENTS} now={NOW} defaultDraft="Looping in @Pr" />),
};
export const PrivateNote: S = {
  name: 'Comment thread, private HR note',
  render: () => panel(<CommentThread currentUser={ME} people={PEOPLE} defaultComments={[...COMMENTS, PRIVATE]} now={NOW} canWritePrivate defaultPrivate />),
};
export const Resolved: S = {
  name: 'Comment thread, resolved',
  render: () => panel(<CommentThread currentUser={ME} people={PEOPLE} defaultComments={COMMENTS} now={NOW} defaultResolved />),
};
export const Empty: S = { name: 'Comment thread, empty', render: () => panel(<CommentThread currentUser={ME} people={PEOPLE} now={NOW} canWritePrivate />) };
export const Mobile: S = {
  name: 'Comment thread, mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <CommentThread currentUser={ME} people={PEOPLE} defaultComments={COMMENTS} now={NOW} canWritePrivate />,
};
