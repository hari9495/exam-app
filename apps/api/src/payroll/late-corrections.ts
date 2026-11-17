import { Prisma } from '@prisma/client';
import { Tx } from '../org-structure/org-structure.service';
import { asDate, dateOf } from '../time/time-core';
import { payOfDay } from '../time/time-rules';
import type { Snapshot } from './calc';

// Fix (late corrections paid; PAY-1.03 / 1.04, YX-LOCK-03): a locked month never changes, so an attendance or leave
// correction approved after the lock (a late request, HR's correction, a late device batch) is paid by the regular run
// of its target month: the locked month is worked out again by the same engine with that day as it should have been,
// and the difference per component is paid (or recovered) as one-time pay under the same components, so PF, ESI, PT and
// tax follow their flags. Payroll may mark one "Not paid" with a reason on the run. Late injury leave (answer 93) stays a
// line for payroll to review: it is not paid by the app.

/** The corrections a regular run pays; injury leave is reviewed by payroll (answer 93). */
export const PAID_SOURCES = ['late_request', 'hr', 'device_backfill'];
/** Every correction the run's corrections panel lists. */
export const LISTED_SOURCES = [...PAID_SOURCES, 'injury_leave'];

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * The unpaid part of the day it should have been (0, 0.5 or 1). Answer 2282: new requests say "present", "half_day",
 * "unpaid" or "leave:<code>"; older free-text ones are read as before (an unknown word counts as a paid day).
 */
export function shouldBeLop(x: { source: string; change: unknown }, leaveTypes: { name: string; code: string; paid: boolean }[]): number {
  if (x.source === 'device_backfill') return 0;
  const said = String((x.change as { shouldBe?: string } | null)?.shouldBe ?? '').trim().toLowerCase();
  if (said === 'unpaid' || said === 'absent') return 1;
  if (said.startsWith('leave:')) {
    const t = leaveTypes.find((l) => l.code.toLowerCase() === said.slice(6));
    return t && !t.paid ? 1 : 0;
  }
  if (said === 'half_day' || said === 'half day') return 0.5;
  if (said === 'present' || said === 'on_leave' || said === 'on leave') return 0;
  const t = leaveTypes.find((l) => l.name.toLowerCase() === said || l.code.toLowerCase() === said);
  return t && !t.paid ? 1 : 0;
}

/** The unpaid part of the day as the locked month paid it (the day as the Time module still holds it). */
export async function wasLop(tx: Tx, org: string, employeeId: string, on: string): Promise<number> {
  const d = await tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org, employeeId, workOn: asDate(on) } } });
  if (!d) return 0;
  const [lp] = await tx.$queryRaw<{ paid: boolean }[]>`
    SELECT bool_and(t.paid) AS paid FROM leave_request_days ld
    JOIN leave_requests r ON r.organization_id = ld.organization_id AND r.id = ld.request_id AND r.status IN ('approved', 'cancel_pending')
    JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
    WHERE ld.organization_id = ${org}::uuid AND ld.employee_id = ${employeeId}::uuid AND ld.active AND ld.portion > 0 AND ld.leave_on = ${on}::date`;
  return payOfDay({ status: d.status, leavePart: d.leavePart as 'full' | 'first' | 'second' | null, leavePaid: lp?.paid ?? null }).lop;
}

/** Per component: what the corrected month pays more (or less) than the month as paid. Earnings only (statutory follow). */
export function componentDifference(asPaid: { code: string; kind: string; amount: string }[], corrected: { code: string; kind: string; amount: string }[], statutory: Set<string>): Map<string, Prisma.Decimal> {
  const sum = (lines: typeof asPaid) => {
    const m = new Map<string, Prisma.Decimal>();
    for (const l of lines) if (l.kind === 'earning' && !statutory.has(l.code)) m.set(l.code, (m.get(l.code) ?? D(0)).add(l.amount));
    return m;
  };
  const a = sum(asPaid);
  const b = sum(corrected);
  const out = new Map<string, Prisma.Decimal>();
  for (const code of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const diff = (b.get(code) ?? D(0)).sub(a.get(code) ?? D(0));
    if (!diff.isZero()) out.set(code, diff);
  }
  return out;
}

/** The snapshot of the locked month with the day's unpaid part changed by `delta` (never below none). */
export function withDayChanged(s: Snapshot, delta: number): Snapshot {
  return { ...s, attendance: { ...s.attendance, lopDays: Prisma.Decimal.max(0, D(s.attendance.lopDays).add(delta)).toFixed(2) } };
}

export function correctionLabel(on: string, delta: number, decidedOn: string | null): string {
  const days = Math.abs(delta) === 1 ? '1 day' : `${Math.abs(delta)} day`;
  return `${delta < 0 ? 'Loss of pay reversed' : 'Loss of pay recovered'} for ${on} (${days}; late correction${decidedOn ? ` approved ${decidedOn}` : ''}).`;
}

/** The approved corrections a regular run of `periodStart` pays for one person. */
export function paidCorrections(tx: Tx, org: string, legalEntityId: string, employeeId: string, periodStart: Date) {
  return tx.payCorrection.findMany({ where: { organizationId: org, legalEntityId, employeeId, source: { in: PAID_SOURCES }, targetPeriod: periodStart, status: 'approved' }, orderBy: [{ workOn: 'asc' }, { createdAt: 'asc' }] });
}

export const monthOf = (d: Date) => dateOf(d).slice(0, 7);

/** Answer 2283: the leaver's last day in this legal entity (left, or an accepted exit with its approved last day), else null. */
export async function lastDayIn(tx: Tx, org: string, employeeId: string, legalEntityId: string): Promise<string | null> {
  const em = await tx.employment.findFirst({ where: { organizationId: org, employeeId, legalEntityId }, orderBy: { joinedOn: 'desc' }, select: { id: true, exitedOn: true } });
  if (!em) return null;
  if (em.exitedOn) return dateOf(em.exitedOn);
  const exit = await tx.exitCase.findFirst({ where: { organizationId: org, employmentId: em.id, status: 'accepted', approvedLwd: { not: null } }, orderBy: { approvedLwd: 'desc' }, select: { approvedLwd: true } });
  return exit?.approvedLwd ? dateOf(exit.approvedLwd) : null;
}

/**
 * Answer 2283: a correction that would be paid in a month after the person left goes to their full and final
 * settlement instead (the F&F run of the month of the last day pays it; it is never lost in a payroll they are not in).
 */
export async function paidIn(tx: Tx, org: string, employeeId: string, legalEntityId: string, nextOpen: string): Promise<{ month: string; fnf: boolean }> {
  const last = await lastDayIn(tx, org, employeeId, legalEntityId);
  return last && nextOpen > last.slice(0, 7) ? { month: last.slice(0, 7), fnf: true } : { month: nextOpen, fnf: false };
}

/** A payslip (approved) already paid this correction: a line points at it. */
export async function correctionPaid(tx: Tx, org: string, correctionId: string): Promise<boolean> {
  const lines = await tx.payslipLine.findMany({ where: { organizationId: org, sourceRef: correctionId }, select: { payslipId: true } });
  if (!lines.length) return false;
  return (await tx.payslip.count({ where: { organizationId: org, id: { in: lines.map((l) => l.payslipId) }, status: 'approved' } })) > 0;
}

/** The leave types a "leave:<code>" choice may name (answer 2282). */
export async function knownLeave(tx: Tx, org: string, shouldBe: string): Promise<boolean> {
  if (!shouldBe.startsWith('leave:')) return true;
  return Boolean(await tx.leaveType.findFirst({ where: { organizationId: org, code: { equals: shouldBe.slice(6), mode: 'insensitive' } }, select: { id: true } }));
}
