// Staffing slice 3: the pure money and date rules of invoices, credit notes, receipts, the e-invoice window, fees and
// the guarantee. Money is paise (bigint); quantities are hundredths; percentages are exact decimal strings from rule
// sets (never floats).

/** "18" or "8.33" as basis points (1800, 833); null when not a 0–100 number with at most 2 decimals. */
export function pctToBp(pct: string): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(pct)) return null;
  const [w, f = ''] = pct.split('.');
  const bp = Number(w) * 100 + Number(f.padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}

/** a × b ÷ d rounded half up (all non-negative). */
const mulDiv = (a: bigint, b: bigint, d: bigint) => (a * b * 2n + d) / (2n * d);

/** A line: quantity (hundredths) × rate (paise), rounded half up to the paisa. */
export const lineAmount = (qtyCenti: number, ratePaise: bigint) => mulDiv(BigInt(qtyCenti), ratePaise, 100n);

/** GST on a taxable value: inter-state IGST; intra-state CGST and SGST half each (an odd paisa goes to SGST). */
export function gstSplit(taxable: bigint, gstBp: number, interState: boolean) {
  const gst = mulDiv(taxable, BigInt(gstBp), 10_000n);
  if (interState) return { cgst: 0n, sgst: 0n, igst: gst, total: taxable + gst };
  const cgst = gst / 2n;
  return { cgst, sgst: gst - cgst, igst: 0n, total: taxable + gst };
}

/** A credit note's taxable value is at most what is left on the invoice after earlier credit notes. */
export function creditProblem(invoiceTaxable: bigint, creditedSoFar: bigint, credit: bigint): string | null {
  if (credit <= 0n) return 'Enter the amount to credit.';
  if (credit > invoiceTaxable - creditedSoFar) return 'The credit is more than what is left on this invoice.';
  return null;
}

/** TDS split over allocations in proportion to each settled amount (largest remainder; sums exactly). */
export function splitTds(tds: bigint, amounts: bigint[]): bigint[] {
  const total = amounts.reduce((s, a) => s + a, 0n);
  if (!total || !tds) return amounts.map(() => 0n);
  const raw = amounts.map((a) => ({ q: (tds * a) / total, r: (tds * a) % total }));
  let left = tds - raw.reduce((s, x) => s + x.q, 0n);
  const order = raw.map((x, i) => ({ i, r: x.r })).sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  const out = raw.map((x) => x.q);
  for (const { i } of order) {
    if (left <= 0n) break;
    out[i]! += 1n;
    left -= 1n;
  }
  return out;
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** HIR-31: where an issued invoice stands in the e-invoice reporting window (rule set GST.EINVOICE_WINDOW). */
export function eInvoiceState(invoiceDate: string, today: string, applies: boolean, rule: { reportWithinDays: number; warnFromDay: number }) {
  const days = daysBetween(invoiceDate, today);
  if (!applies) return { days, state: 'not_applicable' as const };
  if (days > rule.reportWithinDays) return { days, state: 'blocked' as const };
  if (days >= rule.warnFromDay) return { days, state: 'warning' as const };
  return { days, state: 'ok' as const };
}

/** HIR-19 ageing groups by days since the invoice date. */
export function ageingBucket(invoiceDate: string, today: string): '0–30' | '31–60' | '61–90' | '90+' {
  const d = daysBetween(invoiceDate, today);
  return d <= 30 ? '0–30' : d <= 60 ? '31–60' : d <= 90 ? '61–90' : '90+';
}

/** Reminder days relative to the due date (negative = before), per company schedule (`staffing.dunning.schedule`). */
export const DUNNING: Record<string, number[]> = { standard: [-3, 7, 21, 45], gentle: [0, 15, 45], off: [] };
/** The next reminder on or after today for an unpaid invoice, or null. */
export function nextReminder(dueOn: string, today: string, schedule: string): string | null {
  for (const d of DUNNING[schedule] ?? []) {
    const on = addDays(dueOn, d);
    if (on >= today) return on;
  }
  return null;
}

/** HIR-30: fee on a CTC (paise) from a fixed amount or basis points of CTC. */
export const placementFee = (t: { feeKind: string; feePctBp: number | null; feePaise: bigint | null }, ctc: bigint) => (t.feeKind === 'fixed' ? t.feePaise! : mulDiv(ctc, BigInt(t.feePctBp!), 10_000n));
/** HIR-30: the conversion fee tier for months served (taper ascending from month 0). */
export function conversionFee(taper: { fromMonth: number; pctBp: number }[], monthsServed: number, ctc: bigint) {
  const tier = [...taper].sort((a, b) => b.fromMonth - a.fromMonth).find((t) => monthsServed >= t.fromMonth);
  return tier ? mulDiv(ctc, BigInt(tier.pctBp), 10_000n) : 0n;
}
/** HIR-30: a taper starts at month 0, rises strictly by month, and its percentages never go up. */
export function taperProblem(taper: { fromMonth: number; pctBp: number }[]): string | null {
  if (!taper.length) return null;
  if (taper[0]!.fromMonth !== 0) return 'The taper starts at month 0.';
  for (let i = 1; i < taper.length; i++) {
    if (taper[i]!.fromMonth <= taper[i - 1]!.fromMonth) return 'Each row starts after the one before.';
    if (taper[i]!.pctBp > taper[i - 1]!.pctBp) return 'The fee only goes down as months served go up.';
  }
  return null;
}
/** HIR-30: inside the guarantee, a free replacement or a pro-rated credit; outside, nothing. */
export function guaranteeOutcome(fee: bigint, guaranteeDays: number, leftAfterDays: number, remedy: 'replace' | 'refund') {
  if (leftAfterDays > guaranteeDays) return { covered: false, credit: 0n };
  if (remedy === 'replace') return { covered: true, credit: 0n };
  return { covered: true, credit: mulDiv(fee, BigInt(guaranteeDays - leftAfterDays), BigInt(guaranteeDays)) };
}

/** The Monday of an ISO date's week. */
export function mondayOf(iso: string) {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}
