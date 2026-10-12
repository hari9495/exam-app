import { Prisma } from '@prisma/client';

// Expenses batch E5 (M05-BUILD-DESIGN §14; XP-5.01 … 5.03, 5.05): exchange rates and the look-alike image check.
// Rates are "pay currency per one unit of the receipt currency". A day without a published rate (a holiday or a
// weekend) uses the last rate before it, and the line says how old it is.
//
// Rate feeds: only the company's own table is fed. FBIL and ECB imports stay off until their reuse terms are confirmed
// (§14.2, §22 D2): ECB states its reference rates are "for information purposes only" and discourages transaction use,
// and FBIL's terms for reuse could not be confirmed. A feed is added next to the company table once cleared.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export type RateRow = { rateDate: string; rate: Prisma.Decimal.Value };

/** The rate for a day: the last one published on or before it, and how many days old it is. */
export function rateOn(rows: readonly RateRow[], on: string): { rate: string; rateDate: string; ageDays: number } | null {
  let best: RateRow | null = null;
  for (const r of rows) if (r.rateDate <= on && (!best || r.rateDate > best.rateDate)) best = r;
  if (!best) return null;
  return { rate: D(best.rate).toFixed(8), rateDate: best.rateDate, ageDays: Math.round((day(on) - day(best.rateDate)) / 86_400_000) };
}

/** Receipt amount × rate, in the pay currency (2 places, half up). */
export function toPay(receiptAmount: Prisma.Decimal.Value, rate: Prisma.Decimal.Value): string {
  return D(receiptAmount).mul(D(rate)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

/** How far an entered rate is from the reference, in percent (F12 flags above the 3 % tolerance, B18). */
export function variancePct(entered: Prisma.Decimal.Value, reference: Prisma.Decimal.Value): string {
  return D(entered).sub(D(reference)).div(D(reference)).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}
export const FX_TOLERANCE_PCT = 3;

/**
 * A forex advance's unspent balance comes back at the day's rate; the gap to the loading rate is the exchange
 * difference (YX-EXP-15). Positive: the company gained (paid back more in pay currency than it gave out).
 */
export function exchangeDifference(returnedFc: Prisma.Decimal.Value, issueRate: Prisma.Decimal.Value, returnRate: Prisma.Decimal.Value) {
  return { atIssue: toPay(returnedFc, issueRate), atReturn: toPay(returnedFc, returnRate), difference: D(toPay(returnedFc, returnRate)).sub(D(toPay(returnedFc, issueRate))).toFixed(2) };
}

/** F4: bits that differ between two 64-bit perceptual hashes (16 hex characters). */
export function hamming(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}
/** Two photos of the same receipt stay within a few bits; different receipts are far apart. */
export const LOOK_ALIKE_BITS = 10;
