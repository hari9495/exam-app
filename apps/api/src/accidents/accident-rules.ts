// HLP-12 rules as plain functions (docs/yukthix/helpdesk-design-map.md section 4g). Every legal number comes in from a
// statutory rule set (IN.ESI.ACCIDENT, IN.EC.CLAIM); nothing here is a legal value.

export const caseNumber = (n: number) => `ACC-${String(n).padStart(4, '0')}`;

/** "2026-11-03" + n calendar days. */
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Whole days from a to b (both "YYYY-MM-DD"). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export type EcKind = 'death' | 'permanent-total' | 'permanent-partial' | 'temporary';
export interface EcValues {
  payWithinDays: number;
  interestPctYear: number;
  wageCeiling: number;
  deathPct: number;
  deathMin: number;
  totalPct: number;
  totalMin: number;
  tempPct: number;
  waitingDays: number;
}
export interface EcInput {
  kind: EcKind;
  monthlyWage: number;
  /** Schedule IV relevant factor for the person's age (death and permanent disablement). */
  factor?: number;
  disablementPct?: number;
  /** Days unable to work (temporary disablement). */
  days?: number;
}

/** Compensation under the rule set's values, rounded to the rupee, with the working in words. */
export function ecAmount(v: EcValues, i: EcInput): { wageUsed: number; amount: number; formula: string } {
  const wageUsed = Math.min(i.monthlyWage, v.wageCeiling);
  const factor = i.factor ?? 0;
  const total = Math.max(Math.round((v.totalPct / 100) * wageUsed * factor), v.totalMin);
  switch (i.kind) {
    case 'death':
      return { wageUsed, amount: Math.max(Math.round((v.deathPct / 100) * wageUsed * factor), v.deathMin), formula: `${v.deathPct} % × ₹${wageUsed} × ${factor}, at least ₹${v.deathMin}` };
    case 'permanent-total':
      return { wageUsed, amount: total, formula: `${v.totalPct} % × ₹${wageUsed} × ${factor}, at least ₹${v.totalMin}` };
    case 'permanent-partial': {
      const pct = i.disablementPct ?? 0;
      return { wageUsed, amount: Math.round((total * pct) / 100), formula: `${pct} % of the permanent total amount (₹${total})` };
    }
    case 'temporary': {
      const payable = Math.max(0, (i.days ?? 0) - v.waitingDays);
      return { wageUsed, amount: Math.round(((v.tempPct / 100) * wageUsed * payable) / 15), formula: `${v.tempPct} % of ₹${wageUsed} a half-month for ${payable} days after the ${v.waitingDays}-day waiting period` };
    }
  }
}

/**
 * Simple interest (estimate) on compensation not paid by its deadline: from the day it fell due to the day paid (or
 * today), at the rule set's yearly rate. Nothing while paid in time or not yet late.
 */
export function ecInterest(amount: number, fellDueOn: string, deadline: string, paidOrToday: string, pctYear: number): number {
  if (paidOrToday <= deadline) return 0;
  return Math.round((amount * (pctYear / 100) * daysBetween(fellDueOn, paidOrToday)) / 365);
}

export interface Clock {
  key: 'esic' | 'ec';
  label: string;
  due: string | null;
  doneOn: string | null;
}

/** A clock is late when it has a due date, is not done and today is after it. */
export const late = (c: Clock | undefined, today: string) => Boolean(c && c.due && !c.doneOn && today > c.due);

/** Remind again when never reminded, or the last reminder is `every` days old. `off` never. */
export function remindNow(lastOn: string | null, today: string, every: string): boolean {
  if (every === 'off') return false;
  return !lastOn || daysBetween(lastOn, today) >= Number(every);
}

/** The case facts as recorded: later entries win, field by field. */
export interface Facts {
  esiCovered?: boolean;
  ipNumber?: string;
  handlerUserId?: string;
  hospital?: string;
  leaveFrom?: string;
  leaveTo?: string;
}
export const mergeFacts = (steps: { kind: string; data: unknown }[]): Facts =>
  steps.filter((s) => s.kind === 'facts').reduce<Facts>((f, s) => ({ ...f, ...(s.data as Facts) }), {});
