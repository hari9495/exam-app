// Fictional Kaveri Foods sample data for the stories and tests (review rule R3).
import type { AccessLog, AccessRole, AccessUser, EffectiveAccess, Grant, ProfileRequest, ProfileView, RoleTemplate, ScopeChoices } from './types';

export const TODAY_ISO = '2026-09-29';

export const SCOPES: ScopeChoices = {
  entities: [
    { value: 'le-1', label: 'Kaveri Foods Pvt Ltd' },
    { value: 'le-2', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
  ],
  locations: [
    { value: 'loc-1', label: 'Bengaluru head office' },
    { value: 'loc-2', label: 'Chennai office' },
    { value: 'loc-3', label: 'Hosur plant' },
  ],
  departments: [
    { value: 'd-ops', label: 'Operations' },
    { value: 'd-qa', label: 'Quality' },
    { value: 'd-ppl', label: 'People' },
  ],
};

export const TEMPLATES: RoleTemplate[] = [
  { key: 'hr_admin', name: 'HR Admin', typicalScope: 'legal_entity', summary: 'All HR records, job changes, personal details and identity changes for the people in scope.', cannot: 'Pay, Aadhaar in full, payroll approval.', permissions: ['employee.profile.view', 'employee.change.manage', 'employee.identity.view'], confidential: true },
  { key: 'hr_executive', name: 'HR Executive', typicalScope: 'location', summary: 'Day-to-day HR work: records, job changes and personal details for the people in scope.', cannot: 'Pay, identity and bank details, approvals.', permissions: ['employee.profile.view', 'employee.change.manage', 'employee.personal.view'], confidential: false },
  { key: 'payroll_admin', name: 'Payroll Admin', typicalScope: 'legal_entity', summary: 'Pay, pay ranges, entity tax identifiers, and approving bank and identity changes.', cannot: 'HR settings.', permissions: ['employee.salary.view', 'employee.salary.manage', 'employee.identity.approve'], confidential: true },
];

export const ROLES: AccessRole[] = [
  { id: 'r-hr', name: 'HR Admin', permissions: ['employee.profile.view', 'employee.change.manage', 'employee.identity.view'], confidential: true, companyWideOnly: [], grants: 0, assignedUsers: 1 },
  { id: 'r-plant', name: 'Plant HR Executive', permissions: ['employee.profile.view', 'employee.change.manage', 'employee.personal.view'], confidential: false, companyWideOnly: [], grants: 1, assignedUsers: 0 },
  { id: 'r-pay', name: 'Payroll Admin', permissions: ['employee.salary.view', 'employee.salary.manage', 'employee.identity.approve'], confidential: true, companyWideOnly: [], grants: 1, assignedUsers: 1 },
];

export const USERS: AccessUser[] = [
  { id: 'u-anitha', name: 'Anitha Rao', email: 'plant-hr@demo-org.test', role: 'panel', status: 'active', employeeId: null },
  { id: 'u-lakshmi', name: 'Lakshmi Venkatesan', email: 'hr@demo-org.test', role: 'panel', status: 'active', employeeId: 'p-lakshmi' },
  { id: 'u-suresh', name: 'Suresh Pillai', email: 'payroll@demo-org.test', role: 'panel', status: 'active', employeeId: null },
  { id: 'u-ramesh', name: 'Ramesh Iyer', email: 'admin@demo-org.test', role: 'org_admin', status: 'active', employeeId: null },
];

export const GRANTS: Grant[] = [
  {
    id: 'g-1',
    userId: 'u-anitha',
    userName: 'Anitha Rao',
    role: { id: 'r-plant', name: 'Plant HR Executive', confidential: false },
    scope: { type: 'location', id: 'loc-3', name: 'Hosur plant' },
    validFrom: '2026-09-01',
    validTo: null,
    status: 'active',
    reason: 'Plant HR for the Hosur plant',
    grantedBy: 'Arjun Kulkarni',
    grantedById: 'u-admin',
    createdAt: '2026-08-28T10:00:00Z',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  },
  {
    id: 'g-2',
    userId: 'u-lakshmi',
    userName: 'Lakshmi Venkatesan',
    role: { id: 'r-pay', name: 'Payroll Admin', confidential: true },
    scope: { type: 'legal_entity', id: 'le-2', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
    validFrom: '2026-10-01',
    validTo: '2026-12-31',
    status: 'pending',
    reason: 'Cover for Suresh during the quarter close',
    grantedBy: 'Arjun Kulkarni',
    grantedById: 'u-admin',
    createdAt: '2026-09-28T09:30:00Z',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  },
];

export const EFFECTIVE: EffectiveAccess = {
  userId: 'u-anitha',
  hasEmployeeRecord: false,
  keys: [
    { key: 'employee.profile.view', label: 'See job records', people: 42, scopes: [{ type: 'location', id: 'loc-3' }] },
    { key: 'employee.change.approve', label: 'Approve job changes', people: 0, scopes: [] },
    { key: 'employee.personal.view', label: 'See personal details', people: 42, scopes: [{ type: 'location', id: 'loc-3' }] },
    { key: 'employee.salary.view', label: 'See salary', people: 0, scopes: [] },
  ],
};

export const PROFILE_SELF: ProfileView = {
  employeeId: 'p-divya',
  name: 'Divya Raghunathan',
  self: true,
  employeeCode: 'KF-0001',
  joinedOn: '2021-01-11',
  classes: { internal: true, personal: true, identity: true, aadhaar: false, pay: true },
  personal: { dateOfBirth: '1992-03-14', gender: 'female', personalEmail: 'divya.r.home@mail.test', personalPhone: '+919845011122', addressLine1: '14, 3rd Cross, Jayanagar 4th Block', addressLine2: null, city: 'Bengaluru', stateCode: 'IN-KA', postalCode: '560011', country: 'IN', hideBirthday: false },
  identity: {
    legalName: 'Divya Raghunathan',
    pan: '•••• 821K',
    aadhaar: '•••• 0248',
    uan: '•••• 4321',
    esic: null,
    bankAccounts: [{ purpose: 'salary', holderName: 'Divya Raghunathan', ifsc: 'HDFC0001234', account: '•••• 7812', usableFrom: '2026-01-01T00:00:00Z' }],
    pending: [{ requestId: 'pr-1', kind: 'bank_reimbursement' }],
  },
  can: { editPersonal: true, requestChange: true, reveal: true },
};

export const PROFILE_MANAGER: ProfileView = {
  ...PROFILE_SELF,
  employeeId: 'p-arjun',
  name: 'Arjun Kulkarni',
  self: false,
  employeeCode: 'KF-0142',
  joinedOn: '2024-07-01',
  classes: { internal: true, personal: false, identity: false, aadhaar: false, pay: false },
  personal: null,
  identity: null,
  can: { editPersonal: false, requestChange: false, reveal: false },
};

export const REQUESTS: ProfileRequest[] = [
  {
    id: 'pr-1',
    employeeId: 'p-divya',
    employeeName: 'Divya Raghunathan',
    kind: 'bank_reimbursement',
    label: 'Reimbursement bank account',
    proposed: { holderName: 'Divya Raghunathan', ifsc: 'UTIB0000456', account: '•••• 1234' },
    current: null,
    reason: 'Travel claims to my savings account',
    status: 'pending',
    requestedBy: 'Divya Raghunathan',
    requestedAt: '2026-09-27T08:15:00Z',
    mine: false,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    overrideReason: null,
  },
  {
    id: 'pr-2',
    employeeId: 'p-arjun',
    employeeName: 'Arjun Kulkarni',
    kind: 'pan',
    label: 'PAN',
    proposed: { value: '•••• 310M' },
    current: { value: '•••• 210M' },
    reason: 'Typo in the joining form',
    status: 'approved',
    requestedBy: 'Lakshmi Venkatesan',
    requestedAt: '2026-09-20T11:00:00Z',
    mine: false,
    decidedBy: 'Suresh Pillai',
    decidedAt: '2026-09-21T09:00:00Z',
    decisionNote: null,
    overrideReason: null,
  },
];

export const ACCESS_LOG: AccessLog = {
  enabled: true,
  entries: [
    { id: 'a-1', at: '2026-09-28T10:12:00Z', who: 'Suresh Pillai', what: 'Pay', className: 'confidential' },
    { id: 'a-2', at: '2026-09-20T15:40:00Z', who: 'Suresh Pillai', what: 'Salary bank account', className: 'confidential' },
  ],
};
