import '../components/orgchart.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { OrgChart, type OrgPerson } from '../components/orgchart';

const meta: Meta = { title: 'Workflow/Org chart', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

// Fictional company: Suryodaya Foods Pvt Ltd.
const PEOPLE: OrgPerson[] = [
  { id: 'ceo', name: 'Anita Rao', role: 'Chief Executive Officer', department: 'Leadership' },
  { id: 'cfo', name: 'Suresh Pillai', role: 'Chief Financial Officer', department: 'Finance', managerId: 'ceo' },
  { id: 'chro', name: 'Sana Nizami', role: 'Head of People', department: 'People', managerId: 'ceo' },
  { id: 'coo', name: 'Arjun Kulkarni', role: 'Chief Operating Officer', department: 'Operations', managerId: 'ceo' },
  { id: 'fc', name: 'Lakshmi Venkatesan', role: 'Financial Controller', department: 'Finance', managerId: 'cfo' },
  { id: 'acc1', name: 'Meera Krishnan', role: 'Accountant', department: 'Finance', managerId: 'fc' },
  { id: 'acc2', name: 'Rohit Bhat', role: 'Accounts Executive', department: 'Finance', managerId: 'fc' },
  { id: 'vac1', name: '', role: 'Senior Accountant', department: 'Finance', managerId: 'fc', vacant: true },
  { id: 'tax', name: 'Farah Siddiqui', role: 'Tax Manager', department: 'Finance', managerId: 'cfo' },
  { id: 'hrbp', name: 'Imran Qureshi', role: 'HR Business Partner', department: 'People', managerId: 'chro' },
  { id: 'ta', name: 'Nandini Iyer', role: 'Talent Acquisition Lead', department: 'People', managerId: 'chro' },
  { id: 'rec', name: 'Harpreet Singh', role: 'Recruiter', department: 'People', managerId: 'ta' },
  { id: 'payroll', name: 'Divya Raghunathan', role: 'Payroll Specialist', department: 'People', managerId: 'chro', dottedManagerId: 'fc' },
  { id: 'plant', name: 'Karthik Subramanian', role: 'Plant Head, Hosur', department: 'Operations', managerId: 'coo' },
  { id: 'sup1', name: 'Venkata Subrahmanya Lakshminarayana', role: 'Production Supervisor, Line 2 (night shift)', department: 'Operations', managerId: 'plant' },
  { id: 'sup2', name: 'Priya Sharma', role: 'Quality Supervisor', department: 'Operations', managerId: 'plant' },
  { id: 'vac2', name: '', role: 'Maintenance Engineer', department: 'Operations', managerId: 'plant', vacant: true },
  { id: 'scm', name: 'Rahul Menon', role: 'Supply Chain Manager', department: 'Operations', managerId: 'coo', dottedManagerId: 'cfo' },
];

const chart = (extra: Partial<Parameters<typeof OrgChart>[0]> = {}) => (
  <OrgChart people={PEOPLE} rootLabel="Suryodaya Foods" onOpenPerson={() => {}} onExport={() => {}} layout="tree" {...extra} />
);

export const Full: S = { name: 'Reporting lines, fully expanded', render: () => chart({ defaultExpanded: 'all' }) };
export const Default: S = { name: 'Reporting lines, top two levels', render: () => chart() };
export const Searched: S = { name: 'Searched person highlighted', render: () => chart({ defaultSelected: 'rec' }) };
export const Department: S = { name: 'Department view', render: () => chart({ defaultView: 'department', defaultExpanded: 'all' }) };
export const VacantDotted: S = { name: 'Position view, vacant and dotted lines', render: () => chart({ defaultView: 'position', defaultExpanded: 'all' }) };
export const Collapsed: S = { name: 'Collapsed', render: () => chart({ defaultExpanded: [] }) };
export const Focus: S = { name: 'Focused card', parameters: { pseudo: { focusVisible: ['.yx-org__node'] } }, render: () => chart() };
export const MobileDrillDown: S = {
  name: 'Mobile drill-down',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => chart({ layout: 'list', defaultSelected: 'cfo' }),
};
export const MobileTop: S = {
  name: 'Mobile, top level',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => chart({ layout: 'list' }),
};
