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
