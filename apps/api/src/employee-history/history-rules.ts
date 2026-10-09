import { Prisma } from '@prisma/client';
import { addDays } from '../org-structure/org-validation';

// P06 effective-dated history: the change types, which facts each may touch, and the fold that turns an
// ordered list of changes into dated rows. Pure functions; the service does the database work.

export const CHANGE_TYPES = ['join', 'promotion', 'transfer', 'redesignation', 'manager_change', 'salary_revision', 'employment_type_change', 'confirmation', 'correction'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const EMPLOYMENT_STATUSES = ['probation', 'confirmed', 'notice'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export interface CostCentreShare {
  costCentreId: string;
  /** Decimal string, e.g. "60.00". */
  percent: string;
}

export interface AssignmentValues {
  locationId: string;
  departmentId: string;
  designationId: string;
  gradeId: string | null;
  /** 5c-D2: the minimum-wage skill class of the job, or null. */
  skillClass: SkillClass | null;
  employmentTypeId: string;
  managerEmployeeId: string | null;
  costCentres: CostCentreShare[];
  /** M01 Q5: visibility and feedback only, never an approver unless a policy names them (YX-EMP-04). Sorted. */
  dottedLineManagerIds: string[];
}
export const SKILL_CLASSES = ['unskilled', 'semi_skilled', 'skilled', 'highly_skilled'] as const;
export type SkillClass = (typeof SKILL_CLASSES)[number];
export type AssignmentField = keyof AssignmentValues;
export const ASSIGNMENT_FIELDS: readonly AssignmentField[] = ['locationId', 'departmentId', 'designationId', 'gradeId', 'skillClass', 'employmentTypeId', 'managerEmployeeId', 'costCentres', 'dottedLineManagerIds'];
const REQUIRED_ASSIGNMENT: readonly AssignmentField[] = ['locationId', 'departmentId', 'designationId', 'employmentTypeId'];

export interface StatusValues {
  status: EmploymentStatus;
}

export interface CompensationValues {
  currency: string;
  /** Decimal string with 2 places. */
  annualCtc: string;
}

/** New values per fact (P06 §5 payload). A pay increase may be a percentage, kept when rebased (YX-HIS-06). */
export interface ChangePayload {
  assignment?: Partial<AssignmentValues>;
  status?: EmploymentStatus;
  compensation?: { currency?: string; annualCtc?: string; increasePercent?: string };
}

export type Fact = 'assignment' | 'status' | 'compensation';
export const FACTS: readonly Fact[] = ['assignment', 'status', 'compensation'];

interface TypeRule {
  /** Assignment fields the type may set ('all' = any). */
  assignment?: readonly AssignmentField[] | 'all';
  status?: readonly EmploymentStatus[];
  compensation?: boolean;
  /** Facts the change must carry. */
  requires: readonly Fact[];
}

// M01 §3.3: one change action with types; each type declares the facts it can change.
export const TYPE_RULES: Readonly<Record<ChangeType, TypeRule>> = {
  join: { assignment: 'all', status: ['probation', 'confirmed'], compensation: true, requires: ['assignment', 'status'] },
  promotion: { assignment: ['designationId', 'gradeId', 'skillClass'], compensation: true, requires: ['assignment'] },
  transfer: { assignment: ['locationId', 'departmentId', 'costCentres', 'managerEmployeeId', 'dottedLineManagerIds'], requires: ['assignment'] },
  redesignation: { assignment: ['designationId', 'skillClass'], requires: ['assignment'] },
  // M01 §3.2: the primary manager and the dotted lines change through the same change type.
  manager_change: { assignment: ['managerEmployeeId', 'dottedLineManagerIds'], requires: ['assignment'] },
  salary_revision: { compensation: true, requires: ['compensation'] },
  employment_type_change: { assignment: ['employmentTypeId'], requires: ['assignment'] },
  confirmation: { status: ['confirmed'], requires: ['status'] },
  // P06 §4.5: a correction may rewrite any fact from its date.
  correction: { assignment: 'all', status: EMPLOYMENT_STATUSES, compensation: true, requires: [] },
};

/** The problem with a payload for its type, or null. */
export function payloadProblem(type: ChangeType, p: ChangePayload): string | null {
  const rule = TYPE_RULES[type];
  for (const fact of rule.requires) if (p[fact] === undefined) return `A ${label(type)} must set the ${fact}.`;
  if (!p.assignment && !p.status && !p.compensation) return 'The change sets nothing.';
  if (p.assignment) {
    if (!rule.assignment) return `A ${label(type)} cannot change the assignment.`;
    const keys = Object.keys(p.assignment).filter((k) => (p.assignment as Record<string, unknown>)[k] !== undefined) as AssignmentField[];
    if (keys.length === 0) return 'The assignment change sets nothing.';
    if (rule.assignment !== 'all') {
      const bad = keys.find((k) => !(rule.assignment as readonly string[]).includes(k));
      if (bad) return `A ${label(type)} cannot change ${bad}.`;
    }
    if (type === 'join') {
      const missing = REQUIRED_ASSIGNMENT.find((k) => !p.assignment![k]);
      if (missing) return `A join needs ${missing}.`;
    }
    const cc = p.assignment.costCentres;
    if (cc && cc.length) {
      if (new Set(cc.map((x) => x.costCentreId)).size !== cc.length) return 'A cost centre is listed twice.';
      const total = cc.reduce((s, x) => s.add(new Prisma.Decimal(x.percent)), new Prisma.Decimal(0));
      if (!total.equals(100)) return 'Cost centre shares total 100 % (P01 Q8).';
    }
    const dotted = p.assignment.dottedLineManagerIds;
    if (dotted && new Set(dotted).size !== dotted.length) return 'A dotted-line manager is listed twice.';
    if (dotted && p.assignment.managerEmployeeId && dotted.includes(p.assignment.managerEmployeeId)) return 'The manager is not also a dotted-line manager.';
  }
  if (p.status !== undefined) {
    if (!rule.status) return `A ${label(type)} cannot change the employment status.`;
    if (!rule.status.includes(p.status)) return `A ${label(type)} cannot set the status to ${p.status}.`;
  }
  if (p.compensation) {
    if (!rule.compensation) return `A ${label(type)} cannot change pay.`;
    const { annualCtc, increasePercent } = p.compensation;
    if ((annualCtc === undefined) === (increasePercent === undefined)) return 'Give either the new annual CTC or the increase percentage.';
    if (type === 'join' && increasePercent !== undefined) return 'A join gives the annual CTC, not an increase.';
  }
  return null;
}

export const label = (type: ChangeType) => type.replace(/_/g, ' ');

// ---- the fold: changes in date order -> dated segments (P06 §4.3, §4.4) ----

export interface FoldChange {
  id: string;
  /** YYYY-MM-DD */
  effectiveDate: string;
  payload: ChangePayload;
}

export interface Segment<V> {
  from: string;
  /** null = open-ended */
  to: string | null;
  changeId: string;
  values: V;
}

/** The fact's values after `p`, starting from `base`; undefined when the change does not touch the fact. */
export function applyFact(fact: Fact, base: unknown, p: ChangePayload): unknown {
  if (fact === 'assignment') {
    if (!p.assignment) return undefined;
    const next = { ...(base as AssignmentValues | null), ...stripUndefined(p.assignment) } as AssignmentValues;
    next.gradeId ??= null;
    next.skillClass ??= null;
    next.managerEmployeeId ??= null;
    // Stored form: shares sorted, two decimals, so equal splits compare equal.
    next.costCentres = (next.costCentres ?? []).map((x) => ({ costCentreId: x.costCentreId, percent: new Prisma.Decimal(x.percent).toFixed(2) })).sort((a, b) => a.costCentreId.localeCompare(b.costCentreId));
    // A dotted-line manager who becomes the manager stops being a dotted line.
    next.dottedLineManagerIds = (next.dottedLineManagerIds ?? []).filter((m) => m !== next.managerEmployeeId).sort();
    const missing = REQUIRED_ASSIGNMENT.find((k) => !next[k]);
    if (missing) throw new FoldError(`There is no assignment to change yet (${missing} missing).`);
    return next;
  }
  if (fact === 'status') return p.status === undefined ? undefined : ({ status: p.status } satisfies StatusValues);
  if (!p.compensation) return undefined;
  const prior = base as CompensationValues | null;
  const currency = p.compensation.currency ?? prior?.currency ?? 'INR';
  if (p.compensation.annualCtc !== undefined) return { currency, annualCtc: new Prisma.Decimal(p.compensation.annualCtc).toFixed(2) } satisfies CompensationValues;
  // YX-HIS-06: a percentage applies to whatever the base is on its date, so it survives a rebase.
  if (!prior) throw new FoldError('An increase needs a current annual CTC to apply to.');
  if (prior.currency !== currency) throw new FoldError('An increase keeps the currency.');
  const amount = new Prisma.Decimal(prior.annualCtc).mul(new Prisma.Decimal(p.compensation.increasePercent!).div(100).add(1));
  return { currency, annualCtc: amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2) } satisfies CompensationValues;
}

export class FoldError extends Error {}

/**
 * Segments for one fact: `initial` (the row in force before the first change, if any) continued by
 * `changes` (ordered by effective date, then the order raised). Same-day changes collapse into one segment
 * owned by the last; each segment runs until the day before the next one starts.
 */
export function fold<V>(fact: Fact, initial: Segment<V> | null, changes: readonly FoldChange[]): Segment<V>[] {
  const out: Segment<V>[] = initial ? [{ ...initial, to: null }] : [];
  let current: V | null = initial?.values ?? null;
  for (const ch of changes) {
    const next = applyFact(fact, current, ch.payload) as V | undefined;
    if (next === undefined) continue;
    const last = out[out.length - 1];
    if (last && last.from === ch.effectiveDate) {
      last.values = next;
      last.changeId = ch.id;
    } else {
      if (last) last.to = addDays(ch.effectiveDate, -1);
      out.push({ from: ch.effectiveDate, to: null, changeId: ch.id, values: next });
    }
    current = next;
  }
  return out;
}

const stripUndefined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

// ---- retro reach (YX-HIS-12) ----

export type Reach = 'future' | 'retro' | 'before_limit';

/** Start of the financial year containing `today` (fy_start_month of the legal entity), `back` years earlier. */
export function fyStart(today: string, fyStartMonth: number, back = 0): string {
  const [y, m] = today.split('-').map(Number);
  const year = (m >= fyStartMonth ? y : y - 1) - back;
  return `${year}-${String(fyStartMonth).padStart(2, '0')}-01`;
}

export function reach(effectiveDate: string, today: string, retroLimit: string): Reach {
  if (effectiveDate >= today) return 'future';
  return effectiveDate >= retroLimit ? 'retro' : 'before_limit';
}

/** Months a past-dated change touches, for payroll arrears / recoveries (P06 §4.5, Q4). */
export function affectedMonths(from: string, today: string): string[] {
  const months: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const end = today.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end) break;
    months.push(key);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

/** Today's calendar date in a time zone (YX-HIS-04: changes apply at 00:00 local time). */
export function localToday(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
