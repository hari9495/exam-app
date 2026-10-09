import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ActionItem } from '../../components/dashboard';
import { TeamPage } from './directory';
import { d, TEAM_TODAY, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-08 · Team page', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const APPROVALS: ActionItem[] = [
  { id: 'ap1', type: 'Leave', title: 'Casual leave · 30 Sep to 1 Oct (2 days)', who: 'Imran Qureshi', due: d(2026, 9, 29), kind: 'approve' },
  { id: 'ap2', type: 'Probation', title: 'Probation review for Kiran Joshi', who: 'Kiran Joshi', due: d(2026, 9, 30), kind: 'review' },
  { id: 'ap3', type: 'Expense', title: 'Travel claim ₹3,450', who: 'Meera Iyer', due: d(2026, 10, 2), kind: 'approve' },
  { id: 'ap4', type: 'Clearance', title: 'Manager handover sign-off for Meera Iyer', who: 'Meera Iyer', due: d(2026, 10, 17), kind: 'review' },
];
const TASKS = [
  { id: 'tk1', title: 'Manager check-in with Kavya Reddy', due: d(2026, 10, 12), kind: 'Onboarding' },
  { id: 'tk2', title: 'Assign a buddy for Kavya Reddy', due: d(2026, 9, 28), kind: 'Onboarding' },
  { id: 'tk3', title: 'Handover plan for Meera Iyer', due: d(2026, 10, 10), kind: 'Exit' },
];

export const Default: S = { name: 'Manager · team today', render: () => <TeamPage members={TEAM_TODAY} approvals={APPROVALS} tasks={TASKS} today={TODAY} /> };
export const Loading: S = { name: '· loading', render: () => <TeamPage members={TEAM_TODAY} approvals={[]} tasks={TASKS} today={TODAY} state="loading" /> };
export const Empty: S = { name: '· empty (new manager)', render: () => <TeamPage members={[]} approvals={[]} tasks={[]} today={TODAY} /> };
