import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmployeeHistoryService } from '../src/employee-history/employee-history.service';
import { addRole, personForEmployee } from '../src/people/persons';
import { ApprovalsEngine } from '../src/workflow/approvals-engine.service';
import { DayEngine } from '../src/time/day-engine.service';
import { OvertimeService } from '../src/time/overtime.service';
import { PeriodsService } from '../src/time/periods.service';
import { ScheduleBook } from '../src/time/schedule';
import { DEFAULT_RULES, factsOn, monthRange, todayIn } from '../src/time/time-core';
import { addDays, instantAt } from '../src/time/time-maths';

// Step 4 · Time and leave batch 2 demo for Kaveri Foods (fictional throughout):
//   - the Hosur plant (Tamil Nadu) runs three shifts: Morning 6–2, Afternoon 2–10 and Night 10 pm–6 am, on a 21-day
//     rotation (six days on each shift, a weekly off between) with crews A / B / C; five plant workers under Kavya Reddy
//     (production supervisor, now signing in as kavya@demo-org.test); Murugan signs in as murugan@demo-org.test;
//   - Revathi (crew C, nights) has night-work consent on file, confirmed by her in the app, and the plant's safeguards
//     are attested (OSH Code guard); Selvi works the general day shift (no consent: the guard keeps her off nights);
//   - the Hosur plant is a factory (attendance.factories_act "covered" from 1 Jan 2026), so its plant workers' overtime
//     is paid at the legal 2× through the payroll feed, never comp-off (founder decision 9 Oct 2026); the plant OT rule:
//     30 minutes minimum, 15-minute steps, paid; one approved claim last month and an open day this month Murugan can
//     claim;
//   - a timesheet project (FSSAI audit readiness, approved by Divya) with Kiran in Timesheet mode (kiran@demo-org.test);
//   - 100 days of plant punches (so Revathi passes the 80-day maternity check, Selvi does not), and the previous month
//     locked for Kaveri Foods TN with its frozen payroll feed and registers to export.
// Idempotent: the set-up is skipped once the shift "M" exists; recent days are evaluated again.

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function seedTimeB2(tx: Tx, organizationId: string, passwordHash: string) {
  const org = { organizationId };
  const c = { organizationId, isSuperAdmin: false, userId: null };
  const today = todayIn('Asia/Kolkata');
  const engine = new ApprovalsEngine({ forTenant: (_c: unknown, fn: (t: Tx) => unknown) => fn(tx) } as unknown as TenantPrismaService, { notifySystem: async () => undefined } as never, { deliver: async () => undefined } as never);
  const days = new DayEngine();
  // The Hosur plant is a factory (founder decision 9 Oct 2026): ensured on every run, so a database seeded before the
  // decision gets it too (factory overtime is paid at the legal rate, never comp-off).
  const plant = await tx.location.findFirst({ where: { ...org, code: 'HSR-PLT' } });
  if (plant && !(await tx.setting.findFirst({ where: { ...org, scopeType: 'location', scopeId: plant.id, key: 'attendance.factories_act' } }))) {
    await tx.setting.create({ data: { ...org, scopeType: 'location', scopeId: plant.id, key: 'attendance.factories_act', value: 'covered', validFrom: day('2026-01-01') } });
  }
  if (await tx.shift.findFirst({ where: { ...org, code: 'M' } })) {
    const book = await ScheduleBook.load(tx, organizationId);
    for (const e of await tx.employee.findMany({ where: { ...org, workEmail: { endsWith: '@kaverifoods.test' } }, select: { id: true } })) await days.evaluate(tx, c, e.id, addDays(today, -3), today, new Date(), book);
    return;
  }
  const hr = (await tx.user.findFirstOrThrow({ where: { ...org, email: 'hr@demo-org.test' } })).id;
  const divyaUser = (await tx.user.findFirstOrThrow({ where: { ...org, email: 'panel@demo-org.test' } })).id;
  const hosur = await tx.location.findFirstOrThrow({ where: { ...org, code: 'HSR-PLT' } });
  const tnEntity = hosur.legalEntityId;
  const id = async (model: 'department' | 'grade' | 'employmentType', code: string) => (await (tx[model] as unknown as { findFirstOrThrow(a: unknown): Promise<{ id: string }> }).findFirstOrThrow({ where: { ...org, code } })).id;
  const ctxHr = { organizationId, isSuperAdmin: false, userId: hr, role: null };

  // ---- logins for Kavya (supervisor), Murugan (plant worker) and Kiran (timesheet) ----
  const login = async (email: string, name: string) => (await tx.user.upsert({ where: { organizationId_email: { organizationId, email } }, update: {}, create: { ...org, email, name, passwordHash, role: 'panel' } })).id;
  const link = async (workEmail: string, userId: string) => {
    const e = await tx.employee.findFirstOrThrow({ where: { ...org, workEmail } });
    if (!e.userId) {
      await tx.employee.update({ where: { id: e.id }, data: { userId } });
      await addRole(tx, ctxHr, e.personId, 'login', { table: 'users', id: userId }, new Date());
    }
    return e.id;
  };
  const kavyaUser = await login('kavya@demo-org.test', 'Kavya Reddy');
  const kavya = await link('kavya.reddy@kaverifoods.test', kavyaUser);
  const kiranUser = await login('kiran@demo-org.test', 'Kiran Joshi');
  await link('kiran.joshi@kaverifoods.test', kiranUser);

  // ---- five plant workers under Kavya (hired through the same change path as the API, P06) ----
  const operator = (await tx.designation.findFirst({ where: { ...org, code: 'OPERATOR' } })) ?? (await tx.designation.create({ data: { ...org, name: 'Machine Operator', code: 'OPERATOR', jobFamily: 'Operations', ownerLegalEntityId: tnEntity } }));
  const history = new EmployeeHistoryService(undefined as never, undefined as never);
  const [prod, w1, ftc] = [await id('department', 'PROD'), await id('grade', 'W1'), await id('employmentType', 'FTC-PLANT')];
  const workers: Record<string, string> = {};
  const hire = async (key: string, given: string, family: string, code: string, joined: string, gender: 'female' | 'male', userId?: string) => {
    const email = `${given.toLowerCase()}.${family.toLowerCase()}@kaverifoods.test`;
    const personId = await personForEmployee(tx, ctxHr, { givenName: given, familyName: family, email });
    const employee = await tx.employee.create({ data: { ...org, personId, givenName: given, familyName: family, workEmail: email, userId: userId ?? null, createdBy: hr } });
    const employment = await tx.employment.create({ data: { ...org, employeeId: employee.id, legalEntityId: tnEntity, employeeCode: code, codeScopeKey: tnEntity, joinedOn: day(joined), createdBy: hr } });
    await addRole(tx, ctxHr, personId, 'employee', { table: 'employments', id: employment.id }, employment.joinedOn);
    if (userId) await addRole(tx, ctxHr, personId, 'login', { table: 'users', id: userId }, employment.joinedOn);
    const row = await tx.employeeChange.create({
      data: {
        ...org,
        employeeId: employee.id,
        employmentId: employment.id,
        changeType: 'join',
        effectiveDate: day(joined),
        status: 'scheduled',
        payload: { assignment: { locationId: hosur.id, departmentId: prod, designationId: operator.id, gradeId: w1, employmentTypeId: ftc, managerEmployeeId: kavya, costCentres: [] }, status: 'confirmed', compensation: { currency: 'INR', annualCtc: '216000' } } as Prisma.InputJsonObject,
        reason: 'Joined the Hosur plant',
        requestedBy: hr,
        decidedBy: hr,
        decidedAt: new Date(),
      },
    });
    await history.rebuild(tx, ctxHr, employment, joined, row.id);
    await tx.employeeChange.update({ where: { id: row.id }, data: { status: 'effective', appliedAt: new Date() } });
    await tx.employeePersonalDetails.upsert({ where: { organizationId_employeeId: { organizationId, employeeId: employee.id } }, update: { gender }, create: { ...org, employeeId: employee.id, gender } });
    workers[key] = employee.id;
  };
  const muruganUser = await login('murugan@demo-org.test', 'Murugan Selvam');
  await hire('murugan', 'Murugan', 'Selvam', 'KFT-0101', '2025-09-22', 'male', muruganUser);
  await hire('karthik', 'Karthik', 'Raja', 'KFT-0102', '2025-10-01', 'male');
  await hire('anbu', 'Anbu', 'Mani', 'KFT-0103', '2025-10-15', 'male');
  await hire('revathi', 'Revathi', 'Kumar', 'KFT-0104', '2025-09-20', 'female');
  await hire('selvi', 'Selvi', 'Arun', 'KFT-0105', addDays(today, -40), 'female');

  // ---- shifts (§B2) and the 21-day rotation with crews A / B / C (Q2) ----
  const from = '2026-01-01';
  const shift = async (code: string, name: string, colour: string, start: number, end: number, night: boolean) => {
    const s = await tx.shift.create({ data: { ...org, code, name, colour, night, createdBy: hr } });
    await tx.shiftVersion.create({ data: { ...org, shiftId: s.id, validFrom: day(from), startMinute: start, endMinute: end, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 30, breakAboveMinutes: 300, createdBy: hr } });
    return s.id;
  };
  const M = await shift('M', 'Morning', 'orange', 360, 840, false);
  const A = await shift('A', 'Afternoon', 'teal', 840, 1320, false);
  const N = await shift('N', 'Night', 'purple', 1320, 360, true);
  const G = await shift('G', 'General', 'blue', 540, 1050, false);
  const six = (s: string) => [s, s, s, s, s, s, null];
  const rotation = await tx.shiftPattern.create({ data: { ...org, name: 'Hosur 3-shift rotation', kind: 'cycle', cycle: [...six(M), ...six(A), ...six(N)], createdBy: hr } });
  const general = await tx.shiftPattern.create({ data: { ...org, name: 'Plant general (Mon–Sat)', kind: 'weekly', cycle: [G, G, G, G, G, G, null], createdBy: hr } });
  const start = addDays(today, -120);
  const assign = (patternId: string, employeeId: string, offsetDays: number) => tx.shiftPatternAssignment.create({ data: { ...org, patternId, scopeType: 'employee', scopeId: employeeId, validFrom: day(start), offsetDays, createdBy: hr } });
  await assign(rotation.id, workers.murugan, 0);
  await assign(rotation.id, workers.karthik, 7);
  await assign(rotation.id, workers.anbu, 14);
  await assign(rotation.id, workers.revathi, 14);
  await assign(general.id, workers.selvi, 0);

  // ---- the women's night-work records (OSH Code s.43, YX-AT-25 / 26) ----
  await tx.nightWorkConsent.create({ data: { ...org, employeeId: workers.revathi, locationId: hosur.id, givenOn: day(addDays(start, -1)), reference: 'Signed consent form HSR/NW/2026/014, kept by Plant HR', recordedBy: hr, confirmedAt: day(addDays(start, -1)) } });
  for (const item of ['transport', 'security', 'rest_room', 'group', 'posh']) await tx.nightWorkSafeguard.create({ data: { ...org, locationId: hosur.id, item, attestedOn: day(addDays(start, -1)), reviewDue: day(addDays(today, 180)), note: 'Checked on the plant walk-round with the safety officer', attestedBy: hr } });

  // ---- maternity and paternity eligibility by the policy (founder decision 9 Oct 2026) ----
  for (const [code, genders] of [['ML', ['female']], ['PTL', ['male']]] as const) {
    const t = await tx.leaveType.findFirst({ where: { ...org, code } });
    if (t) await tx.leaveType.update({ where: { id: t.id }, data: { rules: { ...DEFAULT_RULES, ...(t.rules as object), eligibleGenders: genders } as Prisma.InputJsonValue } });
  }

  // ---- OT rule for plant workers (Q7): the plant is a factory, so overtime is paid at the legal rate ----
  // Founder decision 9 Oct 2026: factory overtime is paid, not comp-off (P07 IN.FACTORIES, 2× ordinary wages, verify).
  await tx.overtimeRule.create({ data: { ...org, name: 'Hosur plant overtime', scopeType: 'location', scopeId: hosur.id, validFrom: day(from), minMinutes: 30, roundMinutes: 15, dailyCapMinutes: 240, rateNormal: 2, rateWeeklyOff: 2, rateHoliday: 2, needsApproval: true, settle: 'pay', compOffHalfMinutes: 60, compOffFullMinutes: 240, createdBy: hr } });

  // ---- a timesheet project, and Timesheet mode for probationers (D1) ----
  await tx.timesheetProject.create({ data: { ...org, code: 'FSSAI-AUDIT', name: 'FSSAI audit readiness', managerUserId: divyaUser, billable: false, activities: ['Documentation', 'Line checks', 'Training'], createdBy: hr } });
  const prob = await id('employmentType', 'PROB');
  await tx.setting.create({ data: { ...org, scopeType: 'employment_type', scopeId: prob, key: 'attendance.mode', value: 'timesheet', validFrom: day(addDays(today, -7)) } });
  await tx.setting.create({ data: { ...org, scopeType: 'employment_type', scopeId: prob, key: 'attendance.missing_punch_effect', value: 'warning_only', validFrom: day(from) } });

  // ---- 100 days of plant punches by the roster (Murugan stays on 90 minutes twice a week) ----
  const book = await ScheduleBook.load(tx, organizationId);
  const holidays = new Set((await tx.holiday.findMany({ where: { ...org, calendarId: (await tx.holidayCalendar.findFirstOrThrow({ where: { ...org, locationId: hosur.id } })).id } })).filter((h) => h.kind !== 'optional' && h.kind !== 'restricted').map((h) => h.holidayOn.toISOString().slice(0, 10)));
  const rows: Prisma.PunchCreateManyInput[] = [];
  const first = addDays(today, -100);
  const prevMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  let halfDone = false;
  // Kavya too (the location's day shift), up to the week batch 1 already punched for her.
  for (const [key, emp] of [...Object.entries(workers), ['kavya', kavya] as const]) {
    await book.prime([emp], first, today);
    for (let on = first; on < (key === 'kavya' ? addDays(today, -7) : today); on = addDays(on, 1)) {
      const f = await factsOn(tx, organizationId, emp, on);
      if (!f) continue;
      const s = (await book.day(f, on)).shift;
      if (!s || holidays.has(on)) continue;
      const end = s.shiftEnd > s.shiftStart ? s.shiftEnd : s.shiftEnd + 1440;
      const extra = key === 'murugan' && [1, 4].includes(new Date(`${on}T00:00:00Z`).getUTCDay()) ? 90 : 0;
      // One early leave for Murugan last month (a half day he can try to fix once the month is locked).
      if (key === 'murugan' && on.slice(0, 7) === prevMonth && !halfDone) {
        halfDone = true;
        rows.push({ ...org, employeeId: emp, punchedAt: instantAt(on, 'Asia/Kolkata', s.shiftStart - 7), workOn: day(on), kind: 'in', source: 'biometric', accepted: true, verdict: 'inside', locationId: hosur.id, device: 'Gate 1 biometric' }, { ...org, employeeId: emp, punchedAt: instantAt(on, 'Asia/Kolkata', s.shiftStart + 290), workOn: day(on), kind: 'out', source: 'biometric', accepted: true, verdict: 'inside', locationId: hosur.id, device: 'Gate 1 biometric' });
        continue;
      }
      const p = (minute: number, kind: 'in' | 'out') => ({ ...org, employeeId: emp, punchedAt: instantAt(on, 'Asia/Kolkata', minute), workOn: day(on), kind, source: 'biometric', accepted: true, verdict: 'inside', locationId: hosur.id, device: 'Gate 1 biometric' });
      rows.push(p(s.shiftStart - 7, 'in'), p(end + 4 + extra, 'out'));
    }
  }
  await tx.punch.createMany({ data: rows });
  for (const emp of [...Object.values(workers), kavya]) await days.evaluate(tx, c, emp, first, today, new Date(), book);

  // ---- overtime: one claim last month approved by Kavya (paid through the payroll feed), this month left for Murugan ----
  const tenant = { forTenant: (_c: unknown, fn: (t: Tx) => unknown) => fn(tx) } as unknown as TenantPrismaService;
  const ot = new OvertimeService(null as never, tenant, engine, null as never);
  ot.onModuleInit();
  const prev = monthRange(addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7));
  const otDay = (await tx.attendanceDay.findMany({ where: { ...org, employeeId: workers.murugan, workOn: { gte: day(prev.from), lte: day(prev.to) }, workedMinutes: { gte: 500 } }, orderBy: { workOn: 'desc' }, take: 1 }))[0];
  if (otDay) {
    const claim = await ot.claim({ organizationId, isSuperAdmin: false, userId: muruganUser } as never, { userId: muruganUser, role: 'panel', organizationId } as never, { on: otDay.workOn.toISOString().slice(0, 10), reason: 'Stayed on to finish the night cleaning of line 2' });
    const r = await tx.overtimeRequest.findFirstOrThrow({ where: { ...org, id: claim.id } });
    const task = await tx.wfTask.findFirstOrThrow({ where: { ...org, requestId: r.wfRequestId!, assigneeUserId: kavyaUser, status: 'open' } });
    await engine.decide({ organizationId, isSuperAdmin: false, userId: kavyaUser }, kavyaUser, task.id, 'approve', null);
  }

  // ---- the previous month locked for Kaveri Foods TN, with its frozen payroll feed (P08, §B6) ----
  const periods = new PeriodsService(null as never, tenant, days, null as never);
  const lock = await tx.payPeriod.create({ data: { ...org, legalEntityId: tnEntity, periodStart: day(prev.from), periodEnd: day(prev.to), stage: 'locked', changedBy: hr, lockedAt: new Date(), lockedBy: hr } });
  await tx.periodLockEvent.create({ data: { ...org, payPeriodId: lock.id, fromStage: 'open', toStage: 'locked', byUser: hr } });
  const feed = await periods.feedRows(tx, c, tnEntity, prev.from.slice(0, 7));
  await tx.payrollFeedRow.createMany({ data: feed.map((r) => ({ ...org, payPeriodId: lock.id, legalEntityId: tnEntity, periodStart: day(prev.from), employeeId: r.employeeId, mode: r.mode, calendarDays: r.calendarDays, paidDays: r.paidDays, lopDays: r.lopDays, otNormalMinutes: r.otNormalMinutes, otWeeklyOffMinutes: r.otWeeklyOffMinutes, otHolidayMinutes: r.otHolidayMinutes, nightShifts: r.nightShifts, compOffDays: r.compOffDays, timesheetMinutes: r.timesheetMinutes })) });
}
