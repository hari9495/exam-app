import { payOfDay } from '../time/time-rules';

// Founder answer 6 (30 Oct 2026), PAY-21: the payslip's days strip, from the same attendance days and approved leave the
// payroll feed counts payable days from (time feedRows). One cell per day the person was employed in the month.

export type DayKind = 'paid' | 'lop' | 'holiday' | 'off' | 'leave' | 'future';

const next = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * A day with no attendance row is paid until today (an assumed-present group, or a day not worked out yet; unpaid days
 * from a manual LOP input have no dates) and "not yet" after it. A half day of unpaid leave or a half day worked counts
 * as unpaid on the strip (the payslip's own figures carry the half).
 */
export function dayKinds(a: {
  from: string;
  to: string;
  joinedOn: string;
  exitedOn: string | null;
  today: string;
  rows: Map<string, { status: string; leavePart: string | null }>;
  leavePaid: Map<string, boolean>;
}): { day: number; kind: DayKind }[] {
  const out: { day: number; kind: DayKind }[] = [];
  for (let on = a.from; on <= a.to; on = next(on)) {
    if (on < a.joinedOn || (a.exitedOn && on > a.exitedOn)) continue;
    const r = a.rows.get(on);
    const day = Number(on.slice(8, 10));
    if (!r) {
      out.push({ day, kind: on > a.today ? 'future' : 'paid' });
      continue;
    }
    if (r.status === 'holiday') out.push({ day, kind: 'holiday' });
    else if (r.status === 'weekly_off') out.push({ day, kind: 'off' });
    else if (r.status === 'not_started') out.push({ day, kind: 'future' });
    else if (r.status === 'leave') out.push({ day, kind: a.leavePaid.get(on) === false ? 'lop' : 'leave' });
    else {
      const pay = payOfDay({ status: r.status, leavePart: r.leavePart as 'full' | 'first' | 'second' | null, leavePaid: a.leavePaid.get(on) ?? null });
      out.push({ day, kind: pay.lop > 0 ? 'lop' : 'paid' });
    }
  }
  return out;
}
