// Fictional sample data for the Projects screens (M12). Kaveri Foods runs an internal IT services unit (Kaveri Digital) that bills clients.
import type { MappingRule, Milestone, RateCardEntry, ResourcePerson, SourceItem, WipLine } from './projects-logic';
import type { TimesheetApprovalLine } from '../../components/notify';
import type { CapacityPerson } from '../../components/charts';

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);
export { D as PD };

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string | null;
  model: 'Time & material' | 'Fixed fee' | 'Retainer' | 'Non-billable';
  pm: string;
  status: 'Draft' | 'Active' | 'On hold' | 'Closed';
  start: Date;
  end: Date;
  budgetHours: number;
  usedHours: number;
  budgetCost: number;
  cost: number;
  fee: number;
  billed: number;
  wip: number;
  utilisation: number;
  people: number;
  costProvisional: boolean;
}

export const PROJECTS: Project[] = [
  { id: 'p1', code: 'NRP-WEB', name: 'Store locator and loyalty web app', client: 'Nilgiri Retail Pvt Ltd', model: 'Time & material', pm: 'Karthik Subramanian', status: 'Active', start: D(2026, 6, 1), end: D(2026, 12, 31), budgetHours: 3_200, usedHours: 2_710, budgetCost: 38_00_000, cost: 31_40_000, fee: 64_00_000, billed: 44_80_000, wip: 6_24_000, utilisation: 81.4, people: 6, costProvisional: true },
  { id: 'p2', code: 'CLL-WMS', name: 'Warehouse app integration', client: 'Coromandel Logistics Ltd', model: 'Fixed fee', pm: 'Joseph Mathew', status: 'Active', start: D(2026, 4, 15), end: D(2026, 11, 30), budgetHours: 1_800, usedHours: 1_890, budgetCost: 21_00_000, cost: 22_60_000, fee: 30_00_000, billed: 9_00_000, wip: 12_00_000, utilisation: 88.2, people: 4, costProvisional: true },
  { id: 'p3', code: 'DPH-QMS', name: 'Quality management support', client: 'Deccan Pharma Pvt Ltd', model: 'Retainer', pm: 'Divya Raghunathan', status: 'On hold', start: D(2026, 1, 1), end: D(2026, 12, 31), budgetHours: 960, usedHours: 540, budgetCost: 9_60_000, cost: 5_20_000, fee: 14_40_000, billed: 10_80_000, wip: 0, utilisation: 52.0, people: 1, costProvisional: false },
  { id: 'p4', code: 'INT-ERP', name: 'Plant ERP upgrade (internal)', client: null, model: 'Non-billable', pm: 'Prakash Menon', status: 'Active', start: D(2026, 7, 1), end: D(2027, 3, 31), budgetHours: 2_400, usedHours: 820, budgetCost: 26_00_000, cost: 8_90_000, fee: 0, billed: 0, wip: 0, utilisation: 0, people: 5, costProvisional: true },
  { id: 'p5', code: 'NRP-MOB', name: 'Loyalty mobile app', client: 'Nilgiri Retail Pvt Ltd', model: 'Time & material', pm: 'Karthik Subramanian', status: 'Draft', start: D(2026, 11, 1), end: D(2027, 4, 30), budgetHours: 2_000, usedHours: 0, budgetCost: 24_00_000, cost: 0, fee: 40_00_000, billed: 0, wip: 0, utilisation: 0, people: 0, costProvisional: false },
  { id: 'p6', code: 'TBM-DMS', name: 'Dealer portal phase 1', client: 'Tungabhadra Motors', model: 'Fixed fee', pm: 'Joseph Mathew', status: 'Closed', start: D(2025, 10, 1), end: D(2026, 6, 30), budgetHours: 1_500, usedHours: 1_420, budgetCost: 17_00_000, cost: 16_10_000, fee: 25_00_000, billed: 25_00_000, wip: 0, utilisation: 79.0, people: 3, costProvisional: false },
];

export interface Allocation {
  id: string;
  person: string;
  role: string;
  from: Date;
  to: Date;
  percent: number;
  tentative?: boolean;
  bookedThisWeek: number;
  expectedThisWeek: number;
}
export const ALLOCATIONS: Allocation[] = [
  { id: 'a1', person: 'Priya Nair', role: 'Senior developer', from: D(2026, 6, 1), to: D(2026, 12, 31), percent: 100, bookedThisWeek: 40, expectedThisWeek: 40 },
  { id: 'a2', person: 'Rohit Bhat', role: 'Developer', from: D(2026, 6, 1), to: D(2026, 12, 31), percent: 100, bookedThisWeek: 42, expectedThisWeek: 40 },
  { id: 'a3', person: 'Sana Nizami', role: 'Developer', from: D(2026, 8, 1), to: D(2026, 12, 31), percent: 50, bookedThisWeek: 20, expectedThisWeek: 20 },
  { id: 'a4', person: 'Divya Raghunathan', role: 'QA lead', from: D(2026, 6, 1), to: D(2026, 12, 31), percent: 50, bookedThisWeek: 18, expectedThisWeek: 20 },
  { id: 'a5', person: 'Thomas George', role: 'Designer', from: D(2026, 6, 1), to: D(2026, 10, 31), percent: 25, bookedThisWeek: 10, expectedThisWeek: 10 },
  { id: 'a6', person: 'Meera Iyer', role: 'Developer', from: D(2026, 10, 12), to: D(2026, 12, 31), percent: 100, tentative: true, bookedThisWeek: 0, expectedThisWeek: 0 },
];

export interface Task {
  id: string;
  name: string;
  budgetHours: number;
  usedHours: number;
  billable: boolean;
  milestone?: string;
}
export const TASKS: Task[] = [
  { id: 't1', name: 'Discovery and design', budgetHours: 320, usedHours: 318, billable: true },
  { id: 't2', name: 'Store locator build', budgetHours: 1_200, usedHours: 1_140, billable: true },
  { id: 't3', name: 'Loyalty engine', budgetHours: 1_100, usedHours: 890, billable: true },
  { id: 't4', name: 'Testing', budgetHours: 480, usedHours: 322, billable: true },
  { id: 't5', name: 'Internal reviews', budgetHours: 100, usedHours: 40, billable: false },
];

export const MILESTONES: Milestone[] = [
  { id: 'm1', name: 'Design sign-off', pct: 30, due: D(2026, 6, 15), status: 'invoiced', needsClientAcceptance: true },
  { id: 'm2', name: 'Integration live in 3 warehouses', pct: 40, due: D(2026, 9, 25), status: 'completed', needsClientAcceptance: true },
  { id: 'm3', name: 'All warehouses live', pct: 20, due: D(2026, 11, 20), status: 'planned', needsClientAcceptance: true },
];

export const RATE_CARD_PRJ: RateCardEntry[] = [
  { role: 'Senior developer', rate: 2_000, from: D(2026, 4, 1) },
  { role: 'Developer', rate: 1_600, from: D(2026, 4, 1) },
  { role: 'QA lead', rate: 1_800, from: D(2026, 4, 1) },
  { role: 'Designer', rate: 1_700, from: D(2026, 4, 1) },
  { personId: 'priya', rate: 2_200, from: D(2026, 9, 1) },
  { rate: 1_500, from: D(2026, 4, 1) },
];

export const WIP_LINES: WipLine[] = [
  { id: 'w1', personId: 'priya', role: 'Senior developer', date: D(2026, 9, 14), hours: 120, billable: true, approved: true, clientApproved: true, invoiced: false },
  { id: 'w2', personId: 'rohit', role: 'Developer', date: D(2026, 9, 14), hours: 160, billable: true, approved: true, clientApproved: true, invoiced: false },
  { id: 'w3', personId: 'sana', role: 'Developer', date: D(2026, 9, 21), hours: 40, billable: true, approved: true, clientApproved: false, invoiced: false },
  { id: 'w4', personId: 'divya', role: 'QA lead', date: D(2026, 9, 14), hours: 80, billable: true, approved: true, clientApproved: true, invoiced: false },
  { id: 'w5', personId: 'thomas', role: 'Designer', date: D(2026, 9, 7), hours: 12, billable: false, approved: true, clientApproved: null, invoiced: false },
  { id: 'w6', personId: 'rohit', role: 'Developer', date: D(2026, 9, 28), hours: 24, billable: true, approved: false, clientApproved: null, invoiced: false },
];

export interface ApprovalGroup {
  project: string;
  week: string;
  items: { id: string; employee: string; role: string; allocatedHours: number; lines: TimesheetApprovalLine[]; mismatch?: string }[];
}
export const APPROVAL_GROUPS: ApprovalGroup[] = [
  {
    project: 'NRP-WEB · Store locator and loyalty web app',
    week: 'Week of 21 Sep 2026',
    items: [
      { id: 'ta1', employee: 'Priya Nair', role: 'Senior developer', allocatedHours: 40, lines: [{ id: 'l1', project: 'NRP-WEB', task: 'Loyalty engine', hours: 34, billable: true }, { id: 'l2', project: 'NRP-WEB', task: 'Testing', hours: 6, billable: true }] },
      { id: 'ta2', employee: 'Rohit Bhat', role: 'Developer', allocatedHours: 40, lines: [{ id: 'l3', project: 'NRP-WEB', task: 'Store locator build', hours: 38, billable: true }, { id: 'l4', project: 'NRP-WEB', task: 'Stand-up (duplicate entry?)', hours: 4, billable: true }], mismatch: 'Timesheet 42 h vs attendance 40 h worked' },
      { id: 'ta3', employee: 'Sana Nizami', role: 'Developer', allocatedHours: 20, lines: [{ id: 'l5', project: 'NRP-WEB', task: 'Loyalty engine', hours: 20, billable: true }] },
    ],
  },
  {
    project: 'CLL-WMS · Warehouse app integration',
    week: 'Week of 21 Sep 2026',
    items: [{ id: 'ta4', employee: 'Imran Qureshi', role: 'Developer', allocatedHours: 40, lines: [{ id: 'l6', project: 'CLL-WMS', task: 'Integration', hours: 36, billable: false }, { id: 'l7', project: 'CLL-WMS', task: 'Go-live support', hours: 4, billable: false }] }],
  },
];

export const CAPACITY_WEEKS = ['5 Oct', '12 Oct', '19 Oct', '26 Oct', '2 Nov', '9 Nov'];
export const CAPACITY: CapacityPerson[] = [
  { name: 'Priya Nair', role: 'Senior developer', weeks: [{ allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 32 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 32 }] },
  { name: 'Rohit Bhat', role: 'Developer', weeks: [{ allocated: 40, available: 40 }, { allocated: 48, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 20, available: 40 }, { allocated: 20, available: 32 }] },
  { name: 'Sana Nizami', role: 'Developer', weeks: [{ allocated: 20, available: 40 }, { allocated: 20, available: 40 }, { allocated: 20, available: 32 }, { allocated: 20, available: 40 }, { allocated: 20, available: 40 }, { allocated: 20, available: 32 }] },
  { name: 'Divya Raghunathan', role: 'QA lead', weeks: [{ allocated: 30, available: 40 }, { allocated: 30, available: 40 }, { allocated: 30, available: 24 }, { allocated: 30, available: 40 }, { allocated: 30, available: 40 }, { allocated: 30, available: 32 }] },
  { name: 'Thomas George', role: 'Designer', weeks: [{ allocated: 10, available: 40 }, { allocated: 10, available: 40 }, { allocated: 10, available: 40 }, { allocated: 10, available: 40 }, { allocated: 0, available: 40 }, { allocated: 0, available: 32 }] },
  { name: 'Meera Iyer', role: 'Developer', weeks: [{ allocated: 0, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 32 }] },
  { name: 'Imran Qureshi', role: 'Developer', weeks: [{ allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 40 }, { allocated: 40, available: 0 }, { allocated: 40, available: 40 }, { allocated: 40, available: 32 }] },
];

export const UTILISATION = [
  { person: 'Priya Nair', billable: 152, available: 168 },
  { person: 'Rohit Bhat', billable: 150, available: 168 },
  { person: 'Sana Nizami', billable: 80, available: 168 },
  { person: 'Divya Raghunathan', billable: 98, available: 152 },
  { person: 'Thomas George', billable: 40, available: 168 },
  { person: 'Imran Qureshi', billable: 0, available: 168 },
];

export const RESOURCE_PEOPLE: ResourcePerson[] = [
  { id: 'r1', name: 'Kavya Reddy', skills: [{ name: 'SQL', confirmed: true }, { name: 'Power BI', confirmed: true }], allocatedPct: 0, benchSince: D(2026, 9, 1) },
  { id: 'r2', name: 'Manoj Patil', skills: [{ name: 'SQL', confirmed: false }, { name: 'Java', confirmed: true }], allocatedPct: 0, benchSince: D(2026, 9, 18) },
  { id: 'r3', name: 'Sana Nizami', skills: [{ name: 'SQL', confirmed: true }, { name: 'React', confirmed: true }], allocatedPct: 50 },
  { id: 'r4', name: 'Priya Nair', skills: [{ name: 'SQL', confirmed: true }], allocatedPct: 100 },
  { id: 'r5', name: 'Arjun Das', skills: [{ name: 'Python', confirmed: true }], allocatedPct: 0, benchSince: D(2026, 8, 10) },
];

export const MAPPING_RULES: MappingRule[] = [
  { id: 'mr1', source: 'jira', pattern: 'NRPWEB-*', project: 'NRP-WEB', task: 'Store locator build', priority: 1, enabled: true },
  { id: 'mr2', source: 'github', pattern: 'kaveri-digital/loyalty-*', project: 'NRP-WEB', task: 'Loyalty engine', priority: 2, enabled: true },
  { id: 'mr3', source: 'calendar', pattern: '*Nilgiri*', project: 'NRP-WEB', task: 'Client meetings', priority: 3, enabled: true },
  { id: 'mr4', source: 'calendar', pattern: '*stand-up*', project: 'INT-ADM', task: 'Team meetings', priority: 4, enabled: true },
  { id: 'mr5', source: 'jira', pattern: 'WMS-*', project: 'CLL-WMS', task: 'Integration', priority: 5, enabled: false },
];

export const LAST_WEEK_ITEMS: SourceItem[] = [
  { id: 's1', source: 'jira', text: 'NRPWEB-412', hours: 6 },
  { id: 's2', source: 'jira', text: 'NRPWEB-418', hours: 4 },
  { id: 's3', source: 'github', text: 'kaveri-digital/loyalty-engine', hours: 9 },
  { id: 's4', source: 'calendar', text: 'Weekly review with Nilgiri Retail', hours: 1 },
  { id: 's5', source: 'calendar', text: 'Team stand-up', hours: 2.5 },
  { id: 's6', source: 'jira', text: 'WMS-77', hours: 3 },
  { id: 's7', source: 'calendar', text: 'Dentist appointment', hours: 1.5 },
];
