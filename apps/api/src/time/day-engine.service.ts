import { Injectable } from '@nestjs/common';
import { lineApproved } from './line-rules';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { ScheduleBook, lockedDates } from './schedule';
import { asDate, factsOn, holidaysFor, leaveDays, settingOn, todayIn } from './time-core';
import { FlexiRules, HolidayOn, addDays, daysBetween, eachDay, evaluateDay, type PunchKind } from './time-maths';
import { presenceDay } from './time-rules';

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
    const approved = await tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId, status: 'approved', workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { decidedAt: 'asc' } });
    const fixes = approved.filter((x) => x.kind !== 'wfh' && x.kind !== 'on_duty' && x.kind !== 'permission');
    // Batch A item 7 (B4): an approved hourly permission stretches the day like part-day on duty, so it stays present.
    const onDuty = approved.filter((x) => x.kind === 'on_duty' || x.kind === 'permission');
    const wfh = new Set(approved.filter((x) => x.kind === 'wfh').map((x) => x.workOn.toISOString().slice(0, 10)));
    // ChoseWfh: a work-from-home day clocked in from outside and then not approved (or withdrawn): its web punches taken
    // under it ("field" at a restricted place) do not count. Punches are never changed (append-only), the day is.
    const turnedDown = new Set(
      (await tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId, kind: 'wfh', status: { in: ['rejected', 'withdrawn'] }, workOn: { gte: asDate(from), lte: asDate(to) } }, select: { workOn: true } }))
        .map((x) => x.workOn.toISOString().slice(0, 10))
        .filter((on) => !wfh.has(on)),
    );
    const sheets = await this.approvedMinutes(tx, org, employeeId, from, to);
    const locked = await lockedDates(tx, org, employeeId, from, to);
    // Time ops: HR resolutions (the latest per day wins), industrial-action events and presence (TIM-04, 37, 36).
    const resolutions = await tx.attendanceResolution.findMany({ where: { organizationId: org, employeeId, workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { createdAt: 'asc' } });
    const events = await tx.industrialActionEvent.findMany({ where: { organizationId: org, status: 'active', fromOn: { lte: asDate(to) }, toOn: { gte: asDate(from) } } });
    const consents = wfh.size ? await tx.presenceConsent.findMany({ where: { organizationId: org, employeeId } }) : [];
    const signals = consents.length ? await tx.presenceSignal.findMany({ where: { organizationId: org, employeeId, workOn: { gte: asDate(from), lte: asDate(to) } } }) : [];
    // Founder decision 6: a withdrawal deletes the presence trail, but the days it decided stay as they were worked out.
    const before = consents.some((x) => x.withdrawnAt) ? new Map((await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId, workOn: { gte: asDate(from), lte: asDate(to) } } })).map((d) => [d.workOn.toISOString().slice(0, 10), d])) : null;
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
      const resolution = resolutions.filter((x) => x.workOn.toISOString().slice(0, 10) === on).pop();
      const event = events.find((e) => e.locationId === f.locationId && (!e.departmentId || e.departmentId === f.departmentId) && e.fromOn.toISOString().slice(0, 10) <= on && e.toOn.toISOString().slice(0, 10) >= on);
      // Presence counts only with consent in force all through the day and the company's switch on.
      const dayStart = new Date(`${on}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const inForce = wfh.has(on) ? consents.find((x) => x.givenAt <= dayEnd && (!x.withdrawnAt || x.withdrawnAt > dayEnd)) : undefined;
      const consented = Boolean(inForce) && (await settingOn(tx, c, 'attendance.presence', f, on)) === 'on';
      const daySignals = signals.filter((x) => x.workOn.toISOString().slice(0, 10) === on);
      const kept = inForce?.withdrawnAt && !daySignals.length ? before?.get(on) : undefined;
      const presence = !consented ? null : kept?.firstIn && kept.workedMinutes !== null ? { first: kept.firstIn, last: kept.lastOut ?? kept.firstIn, activeMinutes: kept.workedMinutes } : presenceDay(daySignals.map((x) => ({ at: x.at, state: x.state as 'active' })));
      const dropWfh = turnedDown.has(on) && (await sched.locationDay(f, on)).base.checkIn !== 'field';
      const r = evaluateDay({
        on,
        zone: f.zone,
        mode,
        weeklyOff: day.weeklyOff,
        holiday: holidays.get(f.locationId)!.get(on) ?? null,
        leave: leave.get(on) ?? null,
        punches: punches.filter((p) => p.workOn.toISOString().slice(0, 10) === on && !(dropWfh && p.source === 'web' && p.verdict === 'field')).map((p) => ({ at: p.punchedAt, kind: p.kind as PunchKind })),
        fix: fix ? { kind: fix.kind as 'missed_in', inMinute: fix.inMinute, outMinute: fix.outMinute } : null,
        rule,
        now,
        timesheetMinutes: sheets.has(on) ? sheets.get(on)! : null,
        wfh: wfh.has(on),
        resolution: resolution ? { how: resolution.how as 'present' | 'absent', inMinute: resolution.inMinute, outMinute: resolution.outMinute } : null,
        action: (event?.kind as 'strike' | 'lockout' | 'layoff' | undefined) ?? null,
        presence,
        // A flexi shift reads its two company settings (only then: a fixed day reads nothing new).
        flexi: rule.kind === 'flexi' ? { late: (await settingOn(tx, c, 'attendance.flexi.late_from', f, on)) as FlexiRules['late'], short: (await settingOn(tx, c, 'attendance.flexi.short_by', f, on)) as FlexiRules['short'] } : undefined,
        onDuty: (() => {
          const od = onDuty.filter((x) => x.workOn.toISOString().slice(0, 10) === on && x.inMinute !== null && x.outMinute !== null);
          return od.length ? { inMinute: Math.min(...od.map((x) => x.inMinute!)), outMinute: Math.max(...od.map((x) => x.outMinute!)) } : null;
        })(),
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
        // Projects P-2: the approved minutes (a reduced line counts as reduced, a rejected one as none).
        out.set(on, lines.filter((l) => l.timesheetId === s.id).reduce((sum, l) => sum + (lineApproved(l)[k] ?? 0), 0));
      }
    }
    return out;
  }
}
