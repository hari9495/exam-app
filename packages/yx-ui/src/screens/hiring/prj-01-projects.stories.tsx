import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectsListScreen, ProjectWorkspaceScreen, type ProjectExpense } from './projects';
import { ALLOCATIONS, MILESTONES, PD, PROJECTS, RATE_CARD_PRJ, TASKS, WIP_LINES } from './projects-data';
import { TODAY } from '../_kit/data';
import { LIVE_FIXED_FEE_DETAIL, LIVE_PROJECT_CHOICES, LIVE_PROJECT_DETAIL, LIVE_PROJECT_ROWS, LIVE_PROJECT_ROWS_FINANCE } from './projects-live-fixtures';
import type { LiveProjectWorkspace, LiveProjectsList } from './projects';
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

// Projects P-1 (answers 1401 to 1405, 1412, 1420): the live states. No cost, billing, timesheets or expenses until their slices.
const ok = async () => undefined;
const liveList = (over: Partial<LiveProjectsList> = {}): LiveProjectsList => ({ state: 'ready', rows: LIVE_PROJECT_ROWS, can: { create: true, finance: false }, choices: LIVE_PROJECT_CHOICES, onOpen: () => {}, onCreate: async () => 'p9', ...over });
const liveWs = (over: Partial<LiveProjectWorkspace> = {}): LiveProjectWorkspace => ({ state: 'ready', detail: LIVE_PROJECT_DETAIL, choices: LIVE_PROJECT_CHOICES, burn: { warn: 80, over: 100 }, onUpdate: ok, onStatus: ok, onAllocate: ok, onChangeAllocation: ok, onEndAllocation: ok, onAddTask: ok, onChangeTask: ok, onAddMilestone: ok, onCompleteMilestone: ok, ...over });
export const LiveList: S = { name: 'Live · list (Projects manage)', render: () => <ProjectsListScreen live={liveList()} /> };
export const LiveListFinance: S = { name: 'Live · list (Projects finance, with fee)', render: () => <ProjectsListScreen live={liveList({ rows: LIVE_PROJECT_ROWS_FINANCE, can: { create: false, finance: true } })} /> };
export const LiveListNoAccess: S = { name: 'Live · no access (Request access)', render: () => <ProjectsListScreen live={liveList({ state: 'no-access', rows: [] })} /> };
export const LiveListOff: S = { name: 'Live · Projects switched off', render: () => <ProjectsListScreen live={liveList({ state: 'off', rows: [] })} /> };
export const LiveListLongNames: S = { name: 'Live · long codes and names (ellipsis)', render: () => <ProjectsListScreen live={liveList({ rows: [{ ...LIVE_PROJECT_ROWS[0]!, id: 'pl', code: 'FSSAI-AUDIT', name: 'FSSAI audit readiness for the Hosur and Kolar plants', client: 'Nilgiri Retail Private Limited' }, ...LIVE_PROJECT_ROWS] })} /> };
export const LiveNewProject: S = { name: 'Live · new project drawer', render: () => <ProjectsListScreen live={liveList({ defaultNew: true })} /> };
export const LiveWorkspace: S = { name: 'Live · workspace overview with burn alert', render: () => <ProjectWorkspaceScreen live={liveWs()} /> };
export const LiveTeam: S = { name: 'Live · team and allocations', render: () => <ProjectWorkspaceScreen live={liveWs()} defaultTab="team" /> };
export const LiveAllocate: S = { name: 'Live · add allocation drawer', render: () => <ProjectWorkspaceScreen live={liveWs({ defaultDrawer: 'allocate' })} defaultTab="team" /> };
export const LiveEdit: S = { name: 'Live · edit details and budgets drawer', render: () => <ProjectWorkspaceScreen live={liveWs({ defaultDrawer: 'edit' })} /> };
export const LiveTasks: S = { name: 'Live · tasks', render: () => <ProjectWorkspaceScreen live={liveWs()} defaultTab="tasks" /> };
export const LiveTaskDrawer: S = { name: 'Live · add task drawer', render: () => <ProjectWorkspaceScreen live={liveWs({ defaultDrawer: 'task' })} defaultTab="tasks" /> };
export const LiveMilestones: S = { name: 'Live · fixed fee milestones (client accepts)', render: () => <ProjectWorkspaceScreen live={liveWs({ detail: LIVE_FIXED_FEE_DETAIL })} defaultTab="tasks" /> };
export const LiveMilestoneDrawer: S = { name: 'Live · add milestone drawer', render: () => <ProjectWorkspaceScreen live={liveWs({ detail: LIVE_FIXED_FEE_DETAIL, defaultDrawer: 'milestone' })} defaultTab="tasks" /> };
export const LiveClosed: S = { name: 'Live · closed project (read-only)', render: () => <ProjectWorkspaceScreen live={liveWs({ detail: { ...LIVE_PROJECT_DETAIL, project: { ...LIVE_PROJECT_DETAIL.project, status: 'closed' } } })} /> };
export const LiveReader: S = { name: 'Live · Projects view only (no edits)', render: () => <ProjectWorkspaceScreen live={liveWs({ detail: { ...LIVE_PROJECT_DETAIL, can: { edit: false, run: false, team: false, finance: false } } })} /> };
export const LiveLoading: S = { name: 'Live · workspace loading', render: () => <ProjectWorkspaceScreen live={liveWs({ state: 'loading', detail: null })} /> };
export const LiveError: S = { name: 'Live · workspace error', render: () => <ProjectWorkspaceScreen live={liveWs({ state: 'error', detail: null })} /> };

// Projects P-4 (answer 1541): the Timesheets tab with the attendance check.
export const LiveTimesheets: S = { name: 'Live · timesheets this week, attendance check', render: () => <ProjectWorkspaceScreen defaultTab="timesheets" live={liveWs({ timesheets: { week: '2026-11-02', rows: [{ employeeId: 'e1', person: 'Priya Nair', bookedHours: 34, approvedHours: 34, allocatedHours: 40, status: 'approved', mismatch: null }, { employeeId: 'e2', person: 'Rohit Bhat', bookedHours: 26, approvedHours: 20, allocatedHours: 20, status: 'reduced', mismatch: 'Timesheet 42 h vs attendance 40 h worked' }, { employeeId: 'e3', person: 'Meera Iyer', bookedHours: 0, approvedHours: 0, allocatedHours: 16, status: 'missing', mismatch: null }] }, onTimesheetWeek: () => {} })} /> };

// Projects P-5 (answers 1412, 1419): cost to date and the project's expenses.
export const LiveCostFinance: S = { name: 'Live · finance overview with cost against budget', render: () => <ProjectWorkspaceScreen live={liveWs({ detail: { ...LIVE_PROJECT_DETAIL, can: { ...LIVE_PROJECT_DETAIL.can, finance: true }, project: { ...LIVE_PROJECT_DETAIL.project, budgetCost: 2400000, fee: 3600000 } }, cost: { finance: true, hiddenMonths: 0, provisional: true, total: '1650400.00', months: [{ month: '2026-09', cost: '742000.00', expenses: '9000.00', basis: 'final', restatedFrom: null }, { month: '2026-10', cost: '890000.00', expenses: '9400.00', basis: 'provisional', restatedFrom: null }] } })} /> };
export const LiveCostPm: S = { name: 'Live · project manager, cost totals (one month left out)', render: () => <ProjectWorkspaceScreen live={liveWs({ cost: { finance: false, hiddenMonths: 1, provisional: false, total: '742000.00', months: [{ month: '2026-09', cost: '742000.00', expenses: '0.00', basis: 'final', restatedFrom: null }] } })} /> };
export const LiveExpenses: S = { name: 'Live · expenses tagged to the project', render: () => <ProjectWorkspaceScreen defaultTab="expenses" live={liveWs({ expenses: [{ id: 'x1', person: 'Priya Nair', what: 'Travel · Chennai to Coimbatore', spentOn: '2026-10-10', amount: '4860.00', rebill: true, status: 'Approved' }, { id: 'x2', person: 'Rohit Bhat', what: 'Client workshop lunch', spentOn: '2026-10-24', amount: '2150.00', rebill: true, status: 'Pending' }] })} /> };
