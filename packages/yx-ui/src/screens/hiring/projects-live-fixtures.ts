// Projects P-1: sample live data in the API's shapes, for the PRJ-01 live stories and tests.
import type { LiveProjectDetail, LiveProjectRow, ProjectChoices } from './projects-live';

export const LIVE_PROJECT_ROWS: LiveProjectRow[] = [
  { id: 'p1', code: 'NRP-WEB', name: 'Nilgiri Retail web rebuild', clientId: 'c1', client: 'Nilgiri Retail', billingModel: 'time_material', managerUserId: 'u1', manager: 'Karthik Subramanian', status: 'active', startOn: '2026-07-01', endOn: '2027-01-31', budgetHours: 2400, usedHours: 2040, people: 5, clientAcceptsMilestones: false, version: 3, mine: true },
  { id: 'p2', code: 'KAV-ERP', name: 'Kaveri ERP roll-out', clientId: 'c2', client: 'Kaveri Mills', billingModel: 'fixed_fee', managerUserId: 'u2', manager: 'Anita Kurian', status: 'draft', startOn: '2026-11-15', endOn: null, budgetHours: 1200, usedHours: 0, people: 0, clientAcceptsMilestones: true, version: 1, mine: false },
  { id: 'p3', code: 'OLDAUDIT', name: 'Audit readiness', clientId: null, client: null, billingModel: 'non_billable', managerUserId: null, manager: null, status: 'active', startOn: null, endOn: null, budgetHours: null, usedHours: 64, people: 2, clientAcceptsMilestones: false, version: 1, mine: false },
];
/** Projects finance sees fee and cost (answer 1412). */
export const LIVE_PROJECT_ROWS_FINANCE: LiveProjectRow[] = LIVE_PROJECT_ROWS.map((r, i) => ({ ...r, fee: [3_600_000, 2_400_000, null][i] ?? null, budgetCost: [2_400_000, 1_500_000, null][i] ?? null }));

export const LIVE_PROJECT_CHOICES: ProjectChoices = {
  staffingDesk: true,
  clients: [{ id: 'c1', name: 'Nilgiri Retail' }, { id: 'c2', name: 'Kaveri Mills' }],
  managers: [{ id: 'u1', name: 'Karthik Subramanian' }, { id: 'u2', name: 'Anita Kurian' }],
  people: [{ id: 'e1', name: 'Priya Nair' }, { id: 'e2', name: 'Rohit Bhat' }, { id: 'e3', name: 'Meera Iyer' }],
};

export const LIVE_PROJECT_DETAIL: LiveProjectDetail = {
  project: LIVE_PROJECT_ROWS[0]!,
  can: { edit: true, run: true, team: true, finance: false },
  allocations: [
    { id: 'a1', employeeId: 'e1', person: 'Priya Nair', role: 'Tech lead', fromOn: '2026-07-01', toOn: null, percent: 100, tentative: false, bookedHours: 820, version: 1 },
    { id: 'a2', employeeId: 'e2', person: 'Rohit Bhat', role: 'Developer', fromOn: '2026-07-01', toOn: '2026-12-31', percent: 50, tentative: false, bookedHours: 410, version: 2 },
    { id: 'a3', employeeId: 'e3', person: 'Meera Iyer', role: null, fromOn: '2026-11-16', toOn: null, percent: 40, tentative: true, bookedHours: 0, version: 1 },
  ],
  tasks: [
    { id: 't1', name: 'Build', budgetHours: 1600, usedHours: 1500, billable: true, active: true },
    { id: 't2', name: 'Testing', budgetHours: 600, usedHours: 480, billable: true, active: true },
    { id: 't3', name: 'Internal reviews', budgetHours: null, usedHours: 60, billable: false, active: false },
  ],
  milestones: [],
};

export const LIVE_FIXED_FEE_DETAIL: LiveProjectDetail = {
  project: { ...LIVE_PROJECT_ROWS[1]!, status: 'active' },
  can: { edit: true, run: true, team: true, finance: true },
  allocations: [],
  tasks: [],
  milestones: [
    { id: 'm1', name: 'Design sign-off', pct: 30, dueOn: '2026-12-15', status: 'completed', version: 2 },
    { id: 'm2', name: 'Go-live', pct: 50, dueOn: '2027-02-28', status: 'planned', version: 1 },
  ],
};

/** P-2: GET /time/line-approvals in the API's shape (one person over their allocation, one booked outside one). */
export const LIVE_LINE_APPROVALS: import('./projects').LiveApprovalsData = {
  withinAllocation: true,
  groups: [
    {
      projectId: 'p1',
      project: 'NRP-WEB',
      projectName: 'Nilgiri Retail web rebuild',
      week: '2026-11-02',
      clientApproval: 'Nilgiri Retail',
      items: [
        { id: 's1:p1', timesheetId: 's1', employee: 'Priya Nair', allocationPercent: 100, allocatedHours: 40, unallocated: false, bulk: true, lines: [{ id: 'l1', task: 'Build', hours: 34, billable: true, note: null, version: 2 }, { id: 'l2', task: 'Testing', hours: 6, billable: true, note: null, version: 2 }] },
        { id: 's2:p1', timesheetId: 's2', employee: 'Rohit Bhat', allocationPercent: 50, allocatedHours: 20, unallocated: false, bulk: false, lines: [{ id: 'l3', task: 'Build', hours: 26, billable: true, note: 'Release week', version: 2 }] },
        { id: 's3:p1', timesheetId: 's3', employee: 'Meera Iyer', allocationPercent: null, allocatedHours: 0, unallocated: true, bulk: false, lines: [{ id: 'l4', task: 'Testing', hours: 8, billable: true, note: null, version: 2 }] },
      ],
    },
    {
      projectId: 'p3',
      project: 'OLDAUDIT',
      projectName: 'Audit readiness',
      week: '2026-10-26',
      clientApproval: null,
      items: [{ id: 's4:p3', timesheetId: 's4', employee: 'Priya Nair', allocationPercent: 20, allocatedHours: 8, unallocated: false, bulk: true, lines: [{ id: 'l5', task: null, hours: 6, billable: false, note: null, version: 2 }] }],
    },
  ],
};

/** P-4: GET /projects/capacity (HR's view) in the API's shape. */
export const LIVE_CAPACITY: import('./projects').LiveCapacityData = {
  from: '2026-11-09',
  weeks: ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'],
  target: 75,
  limit: 5,
  teamSize: 5,
  privileged: true,
  suppressed: false,
  month: '2026-10',
  people: [
    { employeeId: 'e1', name: 'Priya Nair', weeks: [{ allocated: 40, available: 40 }, { allocated: 40, available: 32 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 32 }], billableHours: 150, availableHours: 176, utilisation: 85 },
    { employeeId: 'e2', name: 'Rohit Bhat', weeks: [{ allocated: 20, available: 40 }, { allocated: 20, available: 40 }, { allocated: 20, available: 40 }, { allocated: 20, available: 40 }, { allocated: 0, available: 40 }, { allocated: 0, available: 40 }], billableHours: 96, availableHours: 176, utilisation: 55 },
    { employeeId: 'e3', name: 'Sana Nizami', weeks: [{ allocated: 48, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 24 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }], billableHours: 140, availableHours: 168, utilisation: 83 },
    { employeeId: 'e4', name: 'Meera Iyer', weeks: [{ allocated: 10, available: 40 }, { allocated: 10, available: 40 }, { allocated: 10, available: 40 }, { allocated: 10, available: 40 }, { allocated: 10, available: 40 }, { allocated: 10, available: 40 }], billableHours: 30, availableHours: 176, utilisation: 17 },
    { employeeId: 'e5', name: 'Arjun Das', weeks: [{ allocated: 0, available: 40 }, { allocated: 0, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }], billableHours: 0, availableHours: 176, utilisation: 0 },
  ],
  team: { billableHours: 416, availableHours: 872, utilisation: 48 },
};

/** P-4: GET /projects/requests and one request's matches. */
export const LIVE_REQUESTS: import('./resourcing-live').ResourceRequestsData = {
  can: { raise: true, fill: true },
  projects: [
    { id: 'p1', code: 'NRP-WEB', name: 'Nilgiri Retail web rebuild' },
    { id: 'p2', code: 'KAV-ERP', name: 'Kaveri ERP roll-out' },
  ],
  rows: [
    { id: 'q1', projectId: 'p1', project: 'NRP-WEB', role: 'SQL developer', percent: 100, fromOn: '2026-12-01', toOn: '2027-04-30', note: 'Reporting module', status: 'open', requestedBy: 'Karthik Subramanian', person: null, mine: true, version: 1 },
    { id: 'q2', projectId: 'p2', project: 'KAV-ERP', role: 'Java developer', percent: 50, fromOn: '2026-11-16', toOn: '2026-12-31', note: null, status: 'filled', requestedBy: 'Anita Kurian', person: 'Rohit Bhat', mine: false, version: 2 },
    { id: 'q3', projectId: 'p1', project: 'NRP-WEB', role: 'Tester', percent: 25, fromOn: '2026-11-16', toOn: '2026-11-30', note: null, status: 'withdrawn', requestedBy: 'Karthik Subramanian', person: null, mine: true, version: 2 },
  ],
};
export const LIVE_MATCHES: import('./resourcing-live').RequestMatches = {
  request: { id: 'q1', percent: 100, fromOn: '2026-12-01', toOn: '2027-04-30', role: 'SQL developer' },
  matches: [
    { employeeId: 'e5', name: 'Arjun Das', free: 100, onBench: true },
    { employeeId: 'e6', name: 'Divya Raghunathan', free: 100, onBench: false },
  ],
};
