import { Injectable } from '@nestjs/common';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { asDate, factsOn, holidaysFor, leaveDays, rulesFor, settingOn, todayIn, type LocationRule } from './time-core';
import { HolidayOn, eachDay, evaluateDay, isWeeklyOff } from './time-maths';

// M02 §B3 day engine: works out each day's status from the expected day (weekly off, holiday, leave), the
// attendance mode (P01 scoped, dated setting, D1) and punches / approved fixes, and stores it (attendance_days).
// Re-run whenever an input changes (a punch, an approved leave or fix) and hourly by the time jobs.

@Injectable()
export class DayEngine {
  /** Evaluates one employee's days from `from` to `to` (never beyond today in their location). Returns days written. */
  async evaluate(tx: Tx, c: CompanyContext, employeeId: string, from: string, to: string, now = new Date()): Promise<number> {
    const org = c.organizationId;
    const leave = await leaveDays(tx, org, employeeId, from, to);
    const punches = await tx.punch.findMany({ where: { organizationId: org, employeeId, accepted: true, workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { punchedAt: 'asc' } });
    const fixes = await tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId, status: 'approved', workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { decidedAt: 'asc' } });
    const holidays = new Map<string, Map<string, HolidayOn>>();
    const rules = new Map<string, (on: string) => LocationRule>();
    let n = 0;
    for (const on of eachDay(from, to)) {
      const f = await factsOn(tx, org, employeeId, on);
      if (!f || on < f.joinedOn || (f.exitedOn && on > f.exitedOn)) continue;
      if (on > todayIn(f.zone, now)) break;
      if (!holidays.has(f.locationId)) holidays.set(f.locationId, (await holidaysFor(tx, org, f.locationId, from, to, employeeId)).map);
      if (!rules.has(f.locationId)) rules.set(f.locationId, await rulesFor(tx, org, f.locationId, to));
      const rule = rules.get(f.locationId)!(on);
      const fix = fixes.filter((x) => x.workOn.toISOString().slice(0, 10) === on).pop();
      const mode = (await settingOn(tx, c, 'attendance.mode', f, on)) as 'punch' | 'assumed_present' | 'timesheet';
      const r = evaluateDay({
        on,
        zone: f.zone,
        mode,
        weeklyOff: isWeeklyOff(on, rule.weeklyOffs),
        holiday: holidays.get(f.locationId)!.get(on) ?? null,
        leave: leave.get(on) ?? null,
        punches: punches.filter((p) => p.workOn.toISOString().slice(0, 10) === on).map((p) => ({ at: p.punchedAt, kind: p.kind as 'in' | 'out' })),
        fix: fix ? { kind: fix.kind as 'missed_in', inMinute: fix.inMinute, outMinute: fix.outMinute } : null,
        rule,
        now,
      });
      const data = { mode, status: r.status, leavePart: r.leavePart, firstIn: r.firstIn, lastOut: r.lastOut, workedMinutes: r.workedMinutes, lateMinutes: r.lateMinutes, regularised: r.regularised, evaluatedAt: now };
      await tx.attendanceDay.upsert({
        where: { organizationId_employeeId_workOn: { organizationId: org, employeeId, workOn: asDate(on) } },
        create: { organizationId: org, employeeId, workOn: asDate(on), ...data },
        update: data,
      });
      n++;
    }
    return n;
  }
}
