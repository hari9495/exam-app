import type { Meta, StoryObj } from '@storybook/react-vite';
import { RoleDashboardScreen } from '../analytics';

const meta: Meta<typeof RoleDashboardScreen> = { title: 'Screens/Analytics/ANL-02 · Role dashboards', component: RoleDashboardScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof RoleDashboardScreen>;

export const Executive: S = {};
export const Hr: S = { name: 'HR', args: { role: 'hr' } };
export const Payroll: S = { name: 'Payroll and finance', args: { role: 'payroll' } };
export const Recruiter: S = { args: { role: 'recruiter' } };
export const DepartmentHead: S = { name: 'Department head (suppressed group)', args: { role: 'depthead' } };
export const Manager: S = { args: { role: 'manager' } };
export const ComplianceOwner: S = { name: 'Compliance owner', args: { role: 'compliance' } };
export const LearningAndDevelopment: S = { name: 'L&D', args: { role: 'ld' } };
export const HelpdeskLead: S = { name: 'Helpdesk lead', args: { role: 'helpdesk' } };
export const Ethics: S = { name: 'Ethics officer / IC (counts only)', args: { role: 'ethics' } };
export const StaffingHead: S = { name: 'Staffing head', args: { role: 'staffing' } };
export const Expenses: S = { name: 'Finance · expenses', args: { role: 'expenses' } };
export const SystemAdmin: S = { name: 'System Admin operations', args: { role: 'sysadmin' } };
export const ProctoringAdmin: S = { name: 'Proctoring admin', args: { role: 'proctoring' } };
export const Dei: S = { name: 'Diversity, equity & inclusion', args: { role: 'dei' } };
export const Loading: S = { args: { loading: true } };
export const ManagerPhone: S = { name: 'Manager cards · phone (wave 6)', args: { role: 'manager' }, globals: { viewport: { value: 'mobile2', isRotated: false } } };

// Answer 2432: the Recruiter dashboard, live (Hire › Dashboard).
import { HiringDashboardScreen, type LiveHiringDashboard } from '../analytics-live';
const hiring = (over: Partial<LiveHiringDashboard> = {}): LiveHiringDashboard => ({
  state: 'ready',
  onRetry: () => undefined,
  period: '90',
  onPeriod: () => undefined,
  data: { openJobs: 18, timeToHire: { medianDays: 34, hiredCount: 14 }, offers: { accepted: 18, declined: 4 }, funnel: [{ stage: 'active', reached: 1240 }, { stage: 'offer', reached: 22 }, { stage: 'hired', reached: 14 }], sources: [{ source: 'application', entered: 820, hired: 9 }, { source: 'referral', entered: 140, hired: 7 }, { source: 'drive', entered: 230, hired: 12 }, { source: 'agency', entered: 50, hired: 3 }] },
  costPerHire: { spend: 679000, hires: 14 },
  links: { jobs: '#jobs', candidates: '#candidates', costs: '#costs' },
  ...over,
});
export const LiveHiring: S = { name: 'Live · Hiring dashboard', render: () => <HiringDashboardScreen live={hiring()} /> };
export const LiveHiringNoCosts: S = { name: 'Live · Hiring dashboard without the costs key', render: () => <HiringDashboardScreen live={hiring({ costPerHire: undefined, links: { jobs: '#jobs', candidates: '#candidates' } })} /> };
export const LiveHiringEmpty: S = { name: 'Live · Hiring dashboard, nothing yet', render: () => <HiringDashboardScreen live={hiring({ data: { openJobs: 0, timeToHire: { medianDays: null, hiredCount: 0 }, offers: { accepted: 0, declined: 0 }, funnel: [], sources: [] }, costPerHire: { spend: 0, hires: 0 } })} /> };
export const LiveHiringLoading: S = { name: 'Live · Hiring dashboard, loading', render: () => <HiringDashboardScreen live={hiring({ state: 'loading', data: null })} /> };
export const LiveHiringError: S = { name: 'Live · Hiring dashboard, could not load', render: () => <HiringDashboardScreen live={hiring({ state: 'error', data: null })} /> };
