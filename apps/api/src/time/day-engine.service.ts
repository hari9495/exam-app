import { Injectable } from '@nestjs/common';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { ScheduleBook, lockedDates } from './schedule';
import { asDate, factsOn, holidaysFor, leaveDays, settingOn, todayIn } from './time-core';
import { HolidayOn, addDays, daysBetween, eachDay, evaluateDay } from './time-maths';

// M02 §B3 day engine: works out each day's status from the expected day (the roster / pattern / location shift and
// weekly off, holidays, leave), the attendance mode (P01 scoped, dated setting, D1) and punches / approved fixes /
// approved timesheet hours, and stores it (attendance_days). Re-run whenever an input changes (a punch, an approved
// leave, fix or timesheet, a published roster) and hourly by the time jobs. Locked periods are never re-evaluated
// (P08; the database refuses it too).

@Injectable()
export class DayEngine {
  /** Evaluates one employee's days from `from` to `to` (never beyond today in their location). Returns days written. */
  async evaluate(tx: Tx, c: CompanyContext, employeeId: string, from: string, to: string, now = new Date(), book?: ScheduleBook): Promise<number> {
    const org = c.organizationId;
    const leave = await leaveDays(tx, org, employeeId, from, to);
    const punches = await tx.punch.findMany({ where: { organizationId: org, employeeId, accepted: true, workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { punchedAt: 'asc' } });
    const fixes = await tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId, status: 'approved', workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { decidedAt: 'asc' } });
    const sheets = await this.approvedMinutes(tx, org, employeeId, from, to);
    const locked = await lockedDates(tx, org, employeeId, from, to);
    const sched = book ?? (await ScheduleBook.load(tx, org));
    await sched.prime([employeeId], from, to);
    const holidays = new Map<string, Map<string, HolidayOn>>();
    let n = 0;
    for (const on of eachDay(from, to)) {
      if (locked.has(on)) continue;
      const f = await factsOn(tx, org, employeeId, on);
      if (!f || on < f.joinedOn || (f.exitedOn && on > f.exitedOn)) continue;
      if (on > todayIn(f.zone, now)) break;
      if (!holidays.has(f.locationId)) holidays.set(f.locationId, (await holidaysFor(tx, org, f.locationId, from, to, employeeId)).map);
      const day = await sched.day(f, on);
      const rule = day.shift ?? (await sched.locationDay(f, on)).rule;
      const fix = fixes.filter((x) => x.workOn.toISOString().slice(0, 10) === on).pop();
      const mode = (await settingOn(tx, c, 'attendance.mode', f, on)) as 'punch' | 'assumed_present' | 'timesheet';
      const r = evaluateDay({
        on,
        zone: f.zone,
        mode,
        weeklyOff: day.weeklyOff,
        holiday: holidays.get(f.locationId)!.get(on) ?? null,
        leave: leave.get(on) ?? null,
        punches: punches.filter((p) => p.workOn.toISOString().slice(0, 10) === on).map((p) => ({ at: p.punchedAt, kind: p.kind as 'in' | 'out' })),
        fix: fix ? { kind: fix.kind as 'missed_in', inMinute: fix.inMinute, outMinute: fix.outMinute } : null,
        rule,
        now,
        timesheetMinutes: sheets.has(on) ? sheets.get(on)! : null,
      });
      const data = { mode, status: r.status, leavePart: r.leavePart, firstIn: r.firstIn, lastOut: r.lastOut, workedMinutes: r.workedMinutes, lateMinutes: r.lateMinutes, regularised: r.regularised, evaluatedAt: now, shiftId: day.shift?.shiftId ?? null };
      await tx.attendanceDay.upsert({
        where: { organizationId_employeeId_workOn: { organizationId: org, employeeId, workOn: asDate(on) } },
        create: { organizationId: org, employeeId, workOn: asDate(on), ...data },
        update: data,
      });
      n++;
    }
    return n;
  }

  /** Approved timesheet minutes per date (§B7): a date of an approved week with no hours is 0, not "no timesheet". */
  private async approvedMinutes(tx: Tx, org: string, employeeId: string, from: string, to: string): Promise<Map<string, number>> {
    const sheets = await tx.timesheet.findMany({ where: { organizationId: org, employeeId, status: 'approved', weekStart: { gte: asDate(addDays(from, -6)), lte: asDate(to) } } });
    const out = new Map<string, number>();
    if (!sheets.length) return out;
    const lines = await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: { in: sheets.map((s) => s.id) } } });
    for (const s of sheets) {
      const monday = s.weekStart.toISOString().slice(0, 10);
      for (let k = 0; k < 7; k++) {
        const on = addDays(monday, k);
        if (daysBetween(from, on) < 0 || on > to) continue;
        out.set(on, lines.filter((l) => l.timesheetId === s.id).reduce((sum, l) => sum + (l.minutes[k] ?? 0), 0));
      }
    }
    return out;
  }
}
