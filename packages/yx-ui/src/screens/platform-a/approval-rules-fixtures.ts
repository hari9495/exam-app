// Fictional sample data for the E2 approval rules editor stories and tests (Kaveri Foods Pvt Ltd).
import type { LivePolicyEditor, MoveRow, NoticeRow, PolicyTypeRow, TryResult } from './approval-rules-types';
import type { LiveLimits } from '../platform-b/limits-live';

export const E2_PEOPLE = [
  { value: 'u-priya', label: 'Priya Nair' },
  { value: 'u-suresh', label: 'Suresh Pillai' },
  { value: 'u-rajesh', label: 'Rajesh Menon' },
];
export const E2_GROUPS = [{ value: 'g-fin', label: 'Finance approvers' }];
export const E2_GRADES = [
  { value: 'gr-3', label: 'G3 Senior' },
  { value: 'gr-5', label: 'G5 Head' },
];
const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

export const E2_TYPES: PolicyTypeRow[] = [
  {
    key: 'ats.requisition',
    label: 'Requisition',
    group: 'Hiring',
    mode: 'full',
    family: 'hiring',
    payKey: null,
    fields: [{ key: 'openings', label: 'Openings', type: 'number' }, { key: 'outside_plan', label: 'Outside the plan', type: 'choice', options: YES_NO }, { key: 'replacement', label: 'Replacement', type: 'choice', options: YES_NO }],
    rules: [{ name: 'Many openings', when: { id: 'g1', join: 'and', items: [{ id: 'c1', field: 'openings', operator: 'gt', value: 3 }] }, steps: [{ name: 'Department head', approver: 'manager_2', mode: 'any' }, { name: 'Finance', approver: 'group', mode: 'any', groupId: 'g-fin' }] }],
    steps: [{ name: 'Hiring manager', approver: 'hiring_manager', mode: 'any' }],
    builtIn: 'The steps under Hiring › Approvals until they move here',
    approvers: 'Many openings: Manager’s manager → A group; Otherwise: Hiring manager',
    version: 3,
    updatedBy: 'Lakshmi Venkatesan',
    updatedAt: '2026-11-20T10:00:00Z',
  },
  {
    key: 'ats.offer',
    label: 'Offer',
    group: 'Hiring',
    mode: 'full',
    family: 'hiring',
    payKey: null,
    fields: [{ key: 'amount', label: 'Fixed pay a year (₹)', type: 'money' }, { key: 'above_range', label: 'Above the pay range', type: 'choice', options: YES_NO }],
    rules: [],
    steps: null,
    builtIn: 'The steps under Hiring › Approvals until they move here; an extra step when the pay is above the range',
    approvers: 'The steps under Hiring › Approvals',
    version: 0,
    updatedBy: null,
    updatedAt: null,
  },
  { key: 'payroll.one_time', label: 'One-time pay', group: 'Pay', mode: 'addon', family: 'pay', payKey: 'payroll.run.approve', fields: [{ key: 'amount', label: 'Amount (₹)', type: 'money' }], rules: [], steps: null, builtIn: 'Payroll approval (a holder of payroll.run.approve who did not enter it)', approvers: 'Payroll approval', version: 0, updatedBy: null, updatedAt: null },
  { key: 'payroll.run', label: 'Payroll run', group: 'Pay', mode: 'locked', family: null, payKey: 'payroll.run.approve', fields: [], rules: [], steps: null, builtIn: 'Payroll approval: a holder of payroll.run.approve who made none of its inputs and is not paid by it', approvers: 'Payroll approval', version: 0, updatedBy: null, updatedAt: null },
  { key: 'leave.cancel', label: 'Leave cancellation', group: 'Time and leave', mode: 'full', family: null, payKey: null, fields: [], rules: [], steps: [{ name: 'Manager', approver: 'manager', mode: 'any' }], builtIn: 'Manager', approvers: 'Manager', version: 1, updatedBy: 'Lakshmi Venkatesan', updatedAt: '2026-11-12T10:00:00Z' },
];

export const E2_TRY: TryResult = {
  rule: 'Many openings',
  values: { openings: 5, outside_plan: 'no', replacement: null },
  builtIn: null,
  steps: [
    { name: 'Department head', from: 'company', state: 'waiting', need: 1, approvers: ['Rajesh Menon'], fallback: false, nobody: false },
    { name: 'Finance', from: 'company', state: 'waiting', need: 1, approvers: ['Suresh Pillai', 'Priya Nair'], fallback: false, nobody: false },
    { name: 'Outside the plan', from: 'required', state: 'waiting', need: 1, approvers: ['Suresh Pillai'], fallback: false, nobody: false },
  ],
};
export const E2_NOTICES: NoticeRow[] = [
  { event: 'requested', label: 'Approval needed', subject: 'Please approve: {title}', body: '{requester} needs your approval at the {step} step.\n\nOpen it: {link}', own: true },
  { event: 'reminder', label: 'Reminder', subject: null, body: null, own: false },
  { event: 'escalated', label: 'Escalated', subject: null, body: null, own: false },
  { event: 'approved', label: 'Approved', subject: null, body: null, own: false },
  { event: 'turned_down', label: 'Turned down', subject: null, body: null, own: false },
  { event: 'sent_back', label: 'Sent back', subject: null, body: null, own: false },
];
export const E2_MOVE: MoveRow[] = [
  { type: 'ats.requisition', label: 'Requisitions', status: 'differs', checked: 12, differences: [{ step: 'Manager', person: 'Arjun Kulkarni', old: ['Suresh Pillai'], new: ['Rajesh Menon'], why: 'Different people approve.' }] },
  { type: 'ats.offer', label: 'Offers', status: 'match', checked: 1, differences: [] },
];

const wait = () => new Promise<void>((r) => setTimeout(r, 300));
export const e2Live = (o: Partial<LivePolicyEditor> = {}): LivePolicyEditor => ({
  state: 'ready',
  onRetry: () => {},
  types: E2_TYPES,
  remindHours: 24,
  escalateHours: 48,
  canEdit: true,
  onSave: wait,
  onReset: wait,
  people: E2_PEOPLE,
  groups: E2_GROUPS,
  grades: E2_GRADES,
  onTry: async () => (await wait(), E2_TRY),
  pastRequests: async () => [{ id: 'r1', title: 'Requisition: QA Engineer', submittedAt: '2026-11-21T09:00:00Z' }],
  notices: { load: async () => ({ events: E2_NOTICES }), save: wait, reset: wait },
  limitsHref: '#',
  ...o,
});

export const e2Limits = (o: Partial<LiveLimits> = {}): LiveLimits => ({
  state: 'ready',
  onRetry: () => {},
  canEdit: true,
  grades: [
    { id: 'gr-1', name: 'G1 Associate', code: 'G1', rank: 1 },
    { id: 'gr-3', name: 'G3 Senior', code: 'G3', rank: 3 },
    { id: 'gr-5', name: 'G5 Head', code: 'G5', rank: 5 },
  ],
  families: [
    { key: 'expense', label: 'Expenses', payKey: null, rows: [{ gradeId: 'gr-3', amount: '50000.00' }, { gradeId: 'gr-5', amount: '200000.00' }], updatedBy: 'Lakshmi Venkatesan', updatedAt: '2026-11-18T10:00:00Z' },
    { key: 'hiring', label: 'Hiring', payKey: null, rows: [], updatedBy: null, updatedAt: null },
    { key: 'pay', label: 'Pay', payKey: 'payroll.run.approve', rows: [], updatedBy: null, updatedAt: null },
  ],
  onSave: wait,
  ...o,
});
