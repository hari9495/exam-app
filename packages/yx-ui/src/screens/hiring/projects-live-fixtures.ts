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
