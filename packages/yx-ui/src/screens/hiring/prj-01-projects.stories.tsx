import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectsListScreen, ProjectWorkspaceScreen, type ProjectExpense } from './projects';
import { ALLOCATIONS, MILESTONES, PD, PROJECTS, RATE_CARD_PRJ, TASKS, WIP_LINES } from './projects-data';
import { TODAY } from '../_kit/data';
import type { TimelineItem } from '../../components/timeline';

const meta: Meta = { title: 'Screens/Projects/PRJ-01 · Projects and project workspace', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const EXP: ProjectExpense[] = [
  { id: 'x1', person: 'Priya Nair', what: 'Travel to client, Chennai to Coimbatore', date: PD(2026, 9, 10), amount: 4_860, rebill: true, status: 'Approved' },
  { id: 'x2', person: 'Divya Raghunathan', what: 'Test devices (2 phones, rental)', date: PD(2026, 9, 3), amount: 6_000, rebill: false, status: 'Approved' },
  { id: 'x3', person: 'Rohit Bhat', what: 'Client workshop lunch', date: PD(2026, 9, 24), amount: 2_150, rebill: true, status: 'Pending' },
];
const ACT: TimelineItem[] = [
  { id: 'y1', actor: { name: 'System' }, action: 'sent a burn alert: hours at 85% of budget', at: PD(2026, 9, 28) },
  { id: 'y2', actor: { name: 'Karthik Subramanian' }, action: 'allocated Meera Iyer (tentative) from 12 Oct', at: PD(2026, 9, 25) },
  { id: 'y3', actor: { name: 'Anita Kurian' }, action: 'issued invoice KF/TN/26-27/0184', at: PD(2026, 9, 1) },
];
const ws = { allocations: ALLOCATIONS, tasks: TASKS, wip: WIP_LINES, rateCard: RATE_CARD_PRJ, expenses: EXP, activity: ACT, today: TODAY };

export const FinanceList: S = { name: 'Finance · all projects with margin', render: () => <ProjectsListScreen rows={PROJECTS} persona="finance" /> };
export const PmList: S = { name: 'PM · my projects', render: () => <ProjectsListScreen rows={PROJECTS} persona="pm" /> };
export const HrList: S = { name: 'HR · no fee or margin', render: () => <ProjectsListScreen rows={PROJECTS} persona="hr" /> };
export const PmOverview: S = { name: 'Workspace · PM overview, burn alert', render: () => <ProjectWorkspaceScreen project={PROJECTS[0]} persona="pm" {...ws} /> };
export const FinanceOverview: S = { name: 'Workspace · finance overview with margin', render: () => <ProjectWorkspaceScreen project={PROJECTS[0]} persona="finance" {...ws} /> };
export const Team: S = { name: 'Workspace · team and allocations', render: () => <ProjectWorkspaceScreen project={PROJECTS[0]} persona="pm" {...ws} defaultTab="team" /> };
export const FixedFeeMilestones: S = { name: 'Workspace · fixed fee, tasks and milestones (over budget)', render: () => <ProjectWorkspaceScreen project={PROJECTS[1]} persona="pm" {...ws} milestones={MILESTONES} defaultTab="tasks" /> };
export const Timesheets: S = { name: 'Workspace · timesheets with attendance mismatch', render: () => <ProjectWorkspaceScreen project={PROJECTS[0]} persona="pm" {...ws} defaultTab="timesheets" /> };
export const Billing: S = { name: 'Workspace · billing, hours held for client approval', render: () => <ProjectWorkspaceScreen project={PROJECTS[0]} persona="finance" {...ws} defaultTab="billing" /> };
export const Expenses: S = { name: 'Workspace · expenses', render: () => <ProjectWorkspaceScreen project={PROJECTS[0]} persona="pm" {...ws} defaultTab="expenses" /> };
export const Closed: S = { name: 'Workspace · closed project', render: () => <ProjectWorkspaceScreen project={PROJECTS[5]} persona="finance" {...ws} /> };
export const Empty: S = { name: 'Empty', render: () => <ProjectsListScreen rows={[]} persona="pm" /> };
export const Loading: S = { name: 'Loading', render: () => <ProjectsListScreen rows={[]} persona="finance" state="loading" /> };
export const Error: S = { name: 'Error', render: () => <ProjectsListScreen rows={[]} persona="finance" state="error" /> };
