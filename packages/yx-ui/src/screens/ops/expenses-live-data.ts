// The live Expenses designs (EXP-01 … EXP-05) read the API's shapes (../expenses/live/types). This file holds the pure
// parts: status words, money as exact paise, what a line's checks say, and the approval steps. Unit-tested.
import type { BadgeTone } from '../../components/display';
import type { ApprovalStep } from '../../components/timeline';
import type { AdvanceStatus, ClaimDetail, ClaimLine, ClaimStatus, LineInput, PaymentStatus, TripStatus } from '../expenses/live/types';

export type { LoadState } from '../org/types';

const D = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
/** "2026-11-03" (or an ISO time) → that day at local midnight. */
export const day = D;

/** Exact money: "1234.5" → 123450 paise (no float sums). */
export function paise(x: string | null | undefined): number {
  if (!x) return 0;
  const neg = x.trim().startsWith('-');
  const [r, f = ''] = x.trim().replace('-', '').split('.');
  const v = Number(r || '0') * 100 + Number((f + '00').slice(0, 2));
  return neg ? -v : v;
}
/** Sum of money strings, exactly, as "1234.50". */
export function sumMoney(xs: (string | null | undefined)[]): string {
  const p = xs.reduce((s, x) => s + paise(x), 0);
  const a = Math.abs(p);
  return `${p < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
/** For display only (formatINR takes a number). */
export const amount = (x: string | null | undefined) => paise(x) / 100;
/** "₹1,234.50" or "AED 1,200.00". */
export const money = (cur: string, x: string | null | undefined) => (x === null || x === undefined ? '—' : `${cur === 'INR' ? '₹' : `${cur} `}${amount(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
/** A typed amount with at most two decimals ("7500", "7500.5"), else null. */
export const moneyInput = (x: string) => (/^\d{1,12}(\.\d{1,2})?$/.test(x.trim()) ? x.trim() : null);
/** "November 2026" for "2026-11". */
export const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const STATUS: Record<ClaimStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  sent_back: { label: 'Sent back', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  partly_approved: { label: 'Partly approved', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};
export const PAYMENT: Record<PaymentStatus, { label: string; tone: BadgeTone } | null> = {
  not_due: null,
  approved_unpaid: { label: 'Approved, unpaid', tone: 'warning' },
  in_payroll: { label: 'Payment in the next payroll', tone: 'info' },
  payout_queued: { label: 'Direct payout queued', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  payment_failed: { label: 'Payment failed', tone: 'danger' },
};
export const TRIP_STATUS: Record<TripStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Requested', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  closed: { label: 'Settled', tone: 'success' },
};
export const ADVANCE_STATUS: Record<AdvanceStatus, { label: string; tone: BadgeTone }> = {
  requested: { label: 'Requested', tone: 'info' },
  approved: { label: 'Approved, not paid yet', tone: 'info' },
  rejected: { label: 'Rejected', tone: 'danger' },
  paid: { label: 'Paid', tone: 'success' },
  settled: { label: 'Settled', tone: 'success' },
  to_fnf: { label: 'Sent to final settlement', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** U62: where the money comes from and when, in the employee's words. */
export function paymentText(status: PaymentStatus, p: NonNullable<ClaimDetail['payment']>): string {
  const when = p.month ? monthName(p.month) : null;
  if (status === 'paid') return p.paidOn ? `Paid on ${day(p.paidOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${p.route === 'payroll' ? ' with your salary' : ' to your bank account'}.` : 'Paid.';
  if (status === 'payment_failed') return p.route === 'payroll' ? 'The salary payment did not go through; payroll pays it again with the salary.' : 'The bank transfer did not go through; finance pays it again.';
  if (p.route === 'payroll') return when ? `Approved: payment in the ${when} payroll.` : 'Approved: payment in the next payroll.';
  return status === 'payout_queued' ? 'Approved: bank transfer queued.' : 'Approved: finance pays it by bank transfer.';
}

export const FLAG_TEXT: Record<string, string> = {
  same_receipt: 'Same receipt',
  same_invoice: 'Same GST invoice',
  look_alike: 'Looks like another bill',
  split: 'Split bills',
  just_under: 'Just under a limit',
  old_receipt: 'Old bill',
  on_leave: 'On a leave day',
  per_diem_overlap: 'Per-diem days twice',
  ocr_mismatch: 'Differs from the receipt',
  gstin_invalid: 'GSTIN looks wrong',
  gst_maths: 'GST does not add up',
  einvoice_invalid: 'E-invoice signature mismatch',
  over_limit: 'Over the limit',
  fx_rate: 'Rate far from the company rate',
};
export const PAY_MODE: Record<ClaimLine['payMode'], string> = { personal: 'Personal', company_card: 'Company card', company_paid: 'Company paid' };

export type LineCheck = { key: string; tone: 'warning' | 'danger'; text: string; short: string };
/** What a line's policy check and flags say, as the design's alerts and the review table's badge. */
export function lineChecks(l: ClaimLine, currency: string, flags: ClaimDetail['flags'] = []): LineCheck[] {
  const out: LineCheck[] = [];
  const p = l.policy;
  if (p?.outcome === 'over_justify') out.push({ key: 'over', tone: 'warning', short: 'Over limit', text: `Over the ${p.limit ? `${money(currency, p.limit.amount)} ` : ''}limit by ${money(currency, p.overBy)}. Your approver decides on the excess.` });
  if (p?.outcome === 'blocked') out.push({ key: 'blocked', tone: 'danger', short: 'Over hard limit', text: `Over the hard limit of ${money(currency, p.limit?.amount ?? '0')}. Lower the amount or remove the line.` });
  if (p?.outcome === 'not_allowed') out.push({ key: 'not-allowed', tone: 'danger', short: 'Not allowed', text: p.reason ?? 'Not allowed for you here.' });
  if (!l.hasReceipt && p?.receipt === 'required' && !l.selfDeclared) out.push({ key: 'receipt', tone: 'warning', short: 'No receipt', text: 'A receipt is needed for this amount. Add one, or declare it was spent for work.' });
  for (const f of flags.filter((x) => x.lineId === l.id && x.status === 'open'))
    out.push({ key: f.id, tone: ['same_receipt', 'same_invoice'].includes(f.kind) ? 'danger' : 'warning', short: FLAG_TEXT[f.kind] ?? f.kind, text: `${FLAG_TEXT[f.kind] ?? f.kind}: ${f.detail}` });
  return out;
}

/** A saved line back as the API's input (to confirm a field-day distance or save a reason as it is). */
export function toLineInput(l: ClaimLine, change: Partial<LineInput> = {}): LineInput {
  return {
    categoryCode: l.categoryCode,
    spentOn: l.spentOn,
    merchant: l.merchant,
    city: l.city,
    payMode: l.payMode,
    description: l.description,
    justification: l.justification,
    ...(l.mileage ? { mileage: { vehicle: l.mileage.vehicle, km: l.mileage.km, ...(l.mileage.from ? { from: l.mileage.from } : {}), ...(l.mileage.to ? { to: l.mileage.to } : {}) } } : l.perDiem ? { perDiem: { fullDays: l.perDiem.fullDays, partialDays: l.perDiem.partialDays } } : l.fx?.amount ? { fx: { currency: l.fx.currency, amount: l.fx.amount, ...(l.fx.source === 'manual' ? { rate: l.fx.rate } : {}) } } : { amount: l.claimed }),
    ...(l.hasReceipt ? {} : { selfDeclared: l.selfDeclared }),
    ...(l.gst ? { gst: { supplierGstin: l.gst.supplierGstin, invoiceNo: l.gst.invoiceNo, taxableValue: l.gst.taxableValue, cgst: l.gst.cgst, sgst: l.gst.sgst, igst: l.gst.igst, billedToGstin: l.gst.billedToGstin } } : {}),
    version: l.version,
    ...change,
  };
}

const STEP: Record<string, ApprovalStep['status']> = { approved: 'done', open: 'current', rejected: 'rejected', sent_back: 'rejected', skipped: 'skipped' };
/** The design's approval timeline: Submitted, then each step of the claim's route with who holds it. */
export function approvalSteps(c: Pick<ClaimDetail, 'person' | 'submittedAt' | 'route'>): ApprovalStep[] {
  return [
    { id: 'sent', label: 'Submitted', status: c.submittedAt ? 'done' : 'current', approver: c.person, ...(c.submittedAt ? { at: new Date(c.submittedAt) } : {}) },
    ...(c.route?.steps ?? []).map((s, i) => ({ id: `s${i}`, label: s.name, status: STEP[s.state] ?? 'pending', ...(s.approvers?.length ? { approver: s.approvers.join(', ') } : {}), ...(s.decidedAt ? { at: new Date(s.decidedAt) } : {}), ...(s.state === 'sent_back' ? { comment: 'Sent back for changes' } : {}) })),
  ];
}

/** "Approved ₹7,500 of ₹9,200 — hotel cap" for a reduced line; null when nothing was cut. */
export function cutText(currency: string, approved: string | null, claimed: string, reason: string | null): string | null {
  if (approved === null || paise(approved) >= paise(claimed)) return null;
  return `Approved ${money(currency, approved)} of ${money(currency, claimed)}${reason ? ` — ${reason}` : ''}`;
}
