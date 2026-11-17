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

/** The unpaid part of the day it should have been (0, 0.5 or 1). Unknown words count as a paid day: the approver said so. */
export function shouldBeLop(x: { source: string; change: unknown }, leaveTypes: { name: string; code: string; paid: boolean }[]): number {
  if (x.source === 'device_backfill') return 0;
  const said = String((x.change as { shouldBe?: string } | null)?.shouldBe ?? '').trim().toLowerCase();
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
