// Fictional sample data for PLT-33…64 (Kaveri Foods Pvt Ltd). Deterministic; dates relative to TODAY (29 Sep 2026).
import type { Rule, RuleSchema } from '../../lib/rules';
import type { Flow } from '../../components/builder';
import type { ImpactRow, PlanStep, RunStep } from './platform-b-kit';

export const d = (m: number, day: number, h = 10, min = 0) => new Date(2026, m - 1, day, h, min);

export const PEOPLE_SCHEMA: RuleSchema = {
  triggers: [
    { value: 'employee.joined', label: 'Employee joins', phrase: 'an employee joins' },
    { value: 'employee.probation_due', label: 'Probation end date is 30 days away', phrase: 'a probation end date is 30 days away' },
    { value: 'leave.balance_changed', label: 'Leave balance changes', phrase: 'a leave balance changes' },
    { value: 'document.expiring', label: 'Document expires in 30 days', phrase: 'a document expires in 30 days' },
    { value: 'leave.submitted', label: 'Leave request is submitted', phrase: 'a leave request is submitted' },
  ],
  fields: [
    { key: 'location.site_type', label: 'Location › Site type (custom)', type: 'choice', options: [{ value: 'office', label: 'Office' }, { value: 'plant', label: 'Plant' }, { value: 'mine', label: 'Mine' }] },
    { key: 'grade', label: 'Grade', type: 'choice', options: ['G3', 'G4', 'G5', 'G6'].map((g) => ({ value: g, label: g })) },
    { key: 'department', label: 'Department', type: 'choice', options: ['Engineering', 'Operations', 'Finance', 'People', 'Sales', 'Quality'].map((x) => ({ value: x, label: x })) },
    { key: 'worker_class', label: 'Worker classification', type: 'choice', options: [{ value: 'workman', label: 'Workman' }, { value: 'staff', label: 'Staff' }] },
    { key: 'leave_balance', label: 'Leave balance (days)', type: 'number' },
    { key: 'joining_date', label: 'Joining date', type: 'date' },
    { key: 'uniform_size', label: 'Uniform size (custom)', type: 'text' },
    { key: 'ctc', label: 'Annual CTC', type: 'money' },
    { key: 'probation_status', label: 'Probation status', type: 'text' },
  ],
  recipients: [
    { value: 'manager', label: 'Reporting manager' },
    { value: 'hrbp', label: 'HR Business Partner' },
    { value: 'employee', label: 'The employee' },
    { value: 'it', label: 'IT helpdesk queue' },
  ],
};

export const PLANT_RULE: Rule = {
  trigger: null,
  conditions: { id: 'g0', join: 'and', items: [{ id: 'c1', field: 'location.site_type', operator: 'is', value: 'plant' }] },
  actions: [],
};

export const IMPACT_ROWS: ImpactRow[] = [
  { id: 'e1', name: 'Murugan Selvam', department: 'Operations · Hosur plant', oldValue: '12 days', newValue: '14 days' },
  { id: 'e2', name: 'Kavitha Ramesh', department: 'Quality · Hosur plant', oldValue: '12 days', newValue: '14 days' },
  { id: 'e3', name: 'Senthil Kumar', department: 'Operations · Hosur plant', oldValue: '12 days', newValue: '14 days' },
  { id: 'e4', name: 'Anitha Prakash', department: 'Operations · Hosur plant', oldValue: '12 days', newValue: '14 days' },
  { id: 'e5', name: 'Rajesh Gowda', department: 'Engineering · Hosur plant', oldValue: '12 days', newValue: '14 days' },
  { id: 'e6', name: 'Farida Begum', department: 'Quality · Hosur plant', oldValue: '12 days', newValue: '14 days' },
  { id: 'e7', name: 'Vignesh Babu', department: 'Operations · Hosur plant', oldValue: '12 days', newValue: '14 days' },
];

export const OT_IMPACT_ROWS: ImpactRow[] = [
  { id: 'o1', name: 'Murugan Selvam', department: 'Operations · Hosur plant', oldValue: '2× (law)', newValue: '1.5× → 2×', moneyDelta: 0, legalAdjusted: true },
  { id: 'o2', name: 'Priya Natarajan', department: 'Sales · Bengaluru', oldValue: '1.25×', newValue: '1.5×', moneyDelta: 1840 },
  { id: 'o3', name: 'Arun Venkatesh', department: 'Engineering · Chennai', oldValue: '1.25×', newValue: '1.5×', moneyDelta: 2260 },
  { id: 'o4', name: 'Kavitha Ramesh', department: 'Quality · Hosur plant', oldValue: '2× (law)', newValue: '1.5× → 2×', moneyDelta: 0, legalAdjusted: true },
  { id: 'o5', name: 'Meera Iyengar', department: 'Finance · Bengaluru', oldValue: '1.25×', newValue: '1.5×', moneyDelta: 1320 },
];

export const SAMPLE_EMPLOYEES = [
  { value: 'KF-0142', label: 'KF-0142 · Murugan Selvam, Hosur plant' },
  { value: 'KF-0088', label: 'KF-0088 · Priya Natarajan, Bengaluru' },
  { value: 'KF-0231', label: 'KF-0231 · Arun Venkatesh, Chennai' },
  { value: 'KF-0017', label: 'KF-0017 · Meera Iyengar, Bengaluru' },
  { value: 'KF-0199', label: 'KF-0199 · Kavitha Ramesh, Hosur plant' },
];

/* ---- Workflow Studio ---- */

export const PROBATION_FLOW: Flow = {
  nodes: [
    { id: 't1', kind: 'trigger', title: '30 days before probation ends', x: 320, y: 40, config: { trigger: 'employee.probation_due' } },
    { id: 'n1', kind: 'notify', title: 'Tell the manager', x: 320, y: 224, config: { recipient: 'manager', message: 'Probation for {employee} ends on {probation_end}. Please confirm or extend.' } },
    { id: 'a1', kind: 'approval', title: 'Manager decides: confirm or extend', x: 320, y: 408, config: { approver: 'manager', expiresDays: 10 } },
    {
      id: 'b1',
      kind: 'condition',
      title: 'Confirmed?',
      x: 320,
      y: 592,
      config: { rule: { trigger: null, conditions: { id: 'g', join: 'and', items: [{ id: 'c', field: 'probation_status', operator: 'is', value: 'Confirmed' }] }, actions: [] } },
    },
    { id: 'u1', kind: 'update', title: 'Set probation status: Confirmed', x: 104, y: 776, config: { field: 'probation_status', value: 'Confirmed' } },
    { id: 'w1', kind: 'wait', title: 'Wait for extension review', x: 536, y: 776, config: { waitDays: 30, timeoutDays: 45 } },
    { id: 'n2', kind: 'notify', title: 'Send confirmation letter', x: 104, y: 960, config: { recipient: 'employee', message: 'Your confirmation letter is ready in Documents.' } },
  ],
  edges: [
    { id: 'e1', from: 't1', to: 'n1', port: 'next' },
    { id: 'e2', from: 'n1', to: 'a1', port: 'next' },
    { id: 'e3', from: 'a1', to: 'b1', port: 'next' },
    { id: 'e4', from: 'b1', to: 'u1', port: 'yes' },
    { id: 'e5', from: 'b1', to: 'w1', port: 'no' },
    { id: 'e6', from: 'u1', to: 'n2', port: 'next' },
  ],
};

export const RUN_STEPS: RunStep[] = [
  { id: 's1', title: 'Find employees in Warehouse B', kind: 'Query', reversible: true, count: 0 },
  { id: 's2', title: 'Set cost centre to CC-OPS-HSR', kind: 'Update record', reversible: true, count: 412 },
  { id: 's3', title: 'Email each employee', kind: 'Notify', reversible: false, count: 412 },
  { id: 's4', title: 'Create IT task for access cards', kind: 'Task', reversible: true, count: 12 },
  { id: 's5', title: 'Post to payroll connector', kind: 'Call connection', reversible: false, count: 1 },
];

export const TRANSFER_PLAN: PlanStep[] = [
  { id: 'p1', action: 'Raise 12 transfer requests to Chakan location from 1 Nov 2026', records: '12 employees in Pune warehouse', api: 'Requests API · transfer', state: 'done', result: '12 requests raised, waiting for approval' },
  { id: 'p2', action: 'Change cost centre to CC-OPS-CKN from 1 Nov 2026', records: '12 employees', api: 'People API · job details', state: 'done', result: '12 records scheduled' },
  { id: 'p3', action: 'Notify the 3 reporting managers', records: '3 managers', api: 'Notifications API', irreversible: true, state: 'running' },
];
