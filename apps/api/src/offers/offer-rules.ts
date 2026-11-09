// HIR-09 / HIR-29 rules (founder decisions 4 and 5, 9 Nov 2026). Pure functions, no Nest, no clock.
//   band       the fixed CTC against the grade's pay range on the day; only ABOVE the range adds the extra approval step
//              (decision 4); below is shown, never a step; no range for the grade = 'none'
//   versions   each change is a new version; a revision needs approval again when the fixed CTC or the grade changed
//              (otherwise an approved or sent offer stays approved and its new letter can go at once)
//   lines      Pay's breakup lines as the offer shows them: earnings and employer costs inside the CTC, the target variable
//              and the one-time joining bonus; deductions and info lines are not part of an offer
import { Prisma } from '@prisma/client';

export type BandPosition = 'within' | 'above' | 'below' | 'none';
export type OfferLineKind = 'earning' | 'employer' | 'variable' | 'one-time';
export interface OfferLine {
  key: string;
  label: string;
  kind: OfferLineKind;
  annual: number;
  monthly: number;
}

const n = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);

export function bandPosition(ctc: Prisma.Decimal.Value, band: { min: Prisma.Decimal.Value; max: Prisma.Decimal.Value } | null): BandPosition {
  if (!band) return 'none';
  if (n(ctc).gt(band.max)) return 'above';
  if (n(ctc).lt(band.min)) return 'below';
  return 'within';
}

/** Founder decision 4: an offer above the grade pay range adds one approval step. */
export const bandAddsStep = (p: BandPosition) => p === 'above';

export const BAND_TEXT: Record<BandPosition, string> = {
  within: 'Within the grade pay range.',
  above: 'Above the grade pay range. Needs extra approval.',
  below: 'Below the grade pay range.',
  none: 'No pay range is set for this grade.',
};

/** A revision goes through approval again when the fixed CTC or the grade changed; the first version always does. */
export function revisionNeedsApproval(prev: { annualCtc: Prisma.Decimal.Value; gradeId: string | null } | null, next: { annualCtc: Prisma.Decimal.Value; gradeId: string | null }): boolean {
  if (!prev) return true;
  return !n(prev.annualCtc).eq(next.annualCtc) || (prev.gradeId ?? null) !== (next.gradeId ?? null);
}

/** Offer statuses a new version may replace. */
export const REVISABLE = ['draft', 'pending_approval', 'approved', 'sent'] as const;

/** The status after a revision: back to draft when it needs approval; an approved or sent offer stays approved otherwise. */
export function statusAfterRevision(status: string, needsApproval: boolean): 'draft' | 'approved' {
  return !needsApproval && (status === 'approved' || status === 'sent') ? 'approved' : 'draft';
}

/** "20 Nov 2026" in India time, as dates are shown everywhere (BUILD-STANDARD rule 8). */
export const formatIstDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Whole rupees, Indian grouping: ₹16,00,000. */
export const inr = (x: Prisma.Decimal.Value) => `₹${Number(n(x).toFixed(0)).toLocaleString('en-IN')}`;

/** The letter's {{compensation}} text (and the old text field, so the letter, PDF and public page keep working). */
export function compensationText(v: { annualCtc: Prisma.Decimal.Value; variablePay: Prisma.Decimal.Value; joiningBonus: Prisma.Decimal.Value; clawbackMonths: number | null }): string {
  const parts = [`Fixed CTC ${inr(v.annualCtc)} a year`];
  if (n(v.variablePay).gt(0)) parts.push(`target variable pay ${inr(v.variablePay)} a year`);
  if (n(v.joiningBonus).gt(0)) parts.push(`a one-time joining bonus of ${inr(v.joiningBonus)}${v.clawbackMonths ? `, repaid if you leave within ${v.clawbackMonths} months` : ''}`);
  return parts.join('; ');
}

/** Pay's breakup lines (amounts as text) → the offer's lines; deductions and info lines are left out. */
export function offerLines(lines: { code: string; name: string; kind: string; monthly: string; annual: string }[], variablePay: Prisma.Decimal.Value, joiningBonus: Prisma.Decimal.Value): OfferLine[] {
  const out: OfferLine[] = lines
    .filter((l) => l.kind === 'earning' || l.kind === 'employer')
    .map((l) => ({ key: l.code, label: l.name, kind: l.kind as OfferLineKind, annual: Number(l.annual), monthly: Number(l.monthly) }));
  if (n(variablePay).gt(0)) out.push({ key: 'variable', label: 'Variable pay (target)', kind: 'variable', annual: Number(n(variablePay).toFixed(2)), monthly: 0 });
  if (n(joiningBonus).gt(0)) out.push({ key: 'joining', label: 'Joining bonus (one time)', kind: 'one-time', annual: Number(n(joiningBonus).toFixed(2)), monthly: 0 });
  return out;
}

/** The company's starting conditions (one a line), trimmed, empty lines and repeats dropped, at most 20. */
export function conditionNames(setting: string): string[] {
  return [...new Set(setting.split('\n').map((s) => s.trim().slice(0, 200)).filter(Boolean))].slice(0, 20);
}

/**
 * Founder answer 334: what a joiner who leaves within the clawback months repays, at the last working day. All of the
 * bonus (the company starter), or the part for the days of the clawback period not served. Nothing once the period is over.
 */
export function clawbackDue(bonus: Prisma.Decimal.Value, joinedOn: string, lastDay: string, months: number | null, basis: 'full' | 'pro_rata'): Prisma.Decimal {
  if (!months || n(bonus).lte(0)) return n(0);
  const start = new Date(`${joinedOn}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  const left = new Date(`${lastDay}T00:00:00Z`);
  if (left >= end) return n(0);
  if (basis === 'full') return n(bonus);
  const total = (end.getTime() - start.getTime()) / 86_400_000;
  const unserved = (end.getTime() - left.getTime()) / 86_400_000 - 1; // the last day itself was served
  return n(bonus).mul(Math.max(0, unserved)).div(total).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}
