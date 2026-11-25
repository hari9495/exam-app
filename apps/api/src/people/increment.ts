import { Prisma } from '@prisma/client';

// PPL-06 annual increment: the money rules, kept pure so they are unit-tested on their own.

/** The new annual CTC after a raise of `percent`, rounded to whole rupees (half up), as "123456.00". */
export function raisedCtc(ctc: Prisma.Decimal.Value, percent: string): string {
  const next = new Prisma.Decimal(ctc).mul(new Prisma.Decimal(percent).div(100).add(1));
  return next.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

/** The raise for one person: their own override first, then the rule (one percent, or the percent for their rating). */
export function percentFor(rule: { mode: 'rating' | 'percent'; percent?: string; byRating?: { band: string; percent: string }[] }, band: string | null, override?: string): string | null {
  if (override !== undefined) return override;
  if (rule.mode === 'percent') return rule.percent ?? null;
  if (!band) return null;
  return rule.byRating?.find((r) => r.band === band)?.percent ?? null;
}
