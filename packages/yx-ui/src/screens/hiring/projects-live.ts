// Projects P-1 (founder answers 1401 to 1405, 1412, 1420): the shapes the projects API returns and accepts, and the
// pure mapping onto the drawn PRJ-01 screens. Dates arrive from JSON as ISO strings.
import type { Allocation, Project, Task } from './projects-data';
import type { Milestone } from './projects-logic';

export type BillingModel = 'time_material' | 'fixed_fee' | 'retainer' | 'non_billable';
export type ProjectStatus = 'draft' | 'active' | 'on_hold' | 'closed';
/** 'off': Projects is switched off for the company (a person who could otherwise open the page). */
export type LiveLoad = 'ready' | 'loading' | 'error' | 'no-access' | 'off';

export const MODEL_LABEL: Record<BillingModel, Project['model']> = { time_material: 'Time & material', fixed_fee: 'Fixed fee', retainer: 'Retainer', non_billable: 'Non-billable' };
export const STATUS_LABEL: Record<ProjectStatus, Project['status']> = { draft: 'Draft', active: 'Active', on_hold: 'On hold', closed: 'Closed' };

export interface LiveProjectRow {
  id: string;
  code: string;
  name: string;
  clientId: string | null;
  client: string | null;
  billingModel: BillingModel;
  managerUserId: string | null;
  manager: string | null;
  status: ProjectStatus;
  startOn: string | null;
  endOn: string | null;
  budgetHours: number | null;
  usedHours: number;
  people: number;
  clientAcceptsMilestones: boolean;
  /** Answer 1408: the client approves this project's hours in the portal (off by default). */
  clientApprovesHours?: boolean;
  /** Projects finance only (answer 1412). */
  fee?: number | null;
  budgetCost?: number | null;
  version: number;
  mine: boolean;
}

export interface LiveAllocation {
  id: string;
  employeeId: string;
  person: string;
  role: string | null;
  fromOn: string;
  toOn: string | null;
  percent: number;
  tentative: boolean;
  bookedHours: number;
  version: number;
}
export interface LiveTask {
  id: string;
  name: string;
  budgetHours: number | null;
  usedHours: number;
  billable: boolean;
  active: boolean;
}
export interface LiveMilestone {
  id: string;
  name: string;
  pct: number;
  dueOn: string;
  status: 'planned' | 'completed' | 'accepted' | 'invoiced';
  version: number;
}
export interface LiveProjectDetail {
  project: LiveProjectRow;
  can: { edit: boolean; run: boolean; team: boolean; finance: boolean };
  allocations: LiveAllocation[];
  tasks: LiveTask[];
  milestones: LiveMilestone[];
}

export interface ProjectChoices {
  /** Answer 1444: the company's billing model for new projects. */
  defaultBillingModel?: BillingModel;
  /** Answer 1547: the staffing desk is on (the client portal, where clients approve hours). */
  staffingDesk?: boolean;
  clients: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  people: { id: string; name: string }[];
}

/** What a new project (or a change to one) sends. */
export interface ProjectInput {
  code: string;
  name: string;
  managerUserId: string | null;
  clientId: string | null;
  billingModel: BillingModel;
  startOn: string | null;
  endOn: string | null;
  budgetHours: number | null;
  budgetCost?: number | null;
  fee?: number | null;
  clientAcceptsMilestones: boolean;
  clientApprovesHours?: boolean;
}
export interface AllocationInput {
  employeeId: string;
  role: string | null;
  fromOn: string;
  toOn: string | null;
  percent: number;
  tentative: boolean;
}
export interface TaskInput {
  name: string;
  budgetHours: number | null;
  billable: boolean;
  active?: boolean;
}
export interface MilestoneInput {
  name: string;
  pct: number;
  dueOn: string;
}

const d = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`) : null);
export const isoOf = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

/** A live project row in the drawn list's shape (no cost, billing or utilisation in P-1). */
export function toProject(r: LiveProjectRow): Project {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    client: r.client,
    model: MODEL_LABEL[r.billingModel],
    pm: r.manager ?? 'No manager',
    status: STATUS_LABEL[r.status],
    start: d(r.startOn) ?? new Date(NaN),
    end: d(r.endOn) ?? new Date(NaN),
    budgetHours: r.budgetHours ?? 0,
    usedHours: r.usedHours,
    budgetCost: r.budgetCost ?? 0,
    cost: 0,
    fee: r.fee ?? 0,
    billed: 0,
    wip: 0,
    utilisation: 0,
    people: r.people,
    costProvisional: false,
  };
}

export const toAllocation = (a: LiveAllocation): Allocation => ({ id: a.id, person: a.person, role: a.role ?? '', from: d(a.fromOn)!, to: d(a.toOn) ?? new Date(NaN), percent: a.percent, tentative: a.tentative, bookedThisWeek: a.bookedHours, expectedThisWeek: 0 });
export const toTask = (t: LiveTask): Task => ({ id: t.id, name: t.name, budgetHours: t.budgetHours ?? 0, usedHours: t.usedHours, billable: t.billable });
export const toMilestone = (m: LiveMilestone, clientAccepts: boolean): Milestone => ({ id: m.id, name: m.name, pct: m.pct, due: d(m.dueOn)!, status: m.status, needsClientAcceptance: clientAccepts });

/** The checks a project form runs before saving (the API checks them again). */
export function projectProblems(i: ProjectInput): { fieldId: string; message: string }[] {
  const out: { fieldId: string; message: string }[] = [];
  if (!/^[A-Z][A-Z0-9-]{0,11}$/.test(i.code)) out.push({ fieldId: 'prj-code', message: 'A code is 1 to 12 capital letters, digits or dashes, starting with a letter.' });
  if (!i.name.trim()) out.push({ fieldId: 'prj-name', message: 'Give the project a name.' });
  if (i.billingModel !== 'non_billable' && !i.clientId) out.push({ fieldId: 'prj-client', message: 'A billable project needs a client.' });
  if (i.startOn && i.endOn && i.endOn < i.startOn) out.push({ fieldId: 'prj-end', message: 'The end date is before the start date.' });
  return out;
}
