import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { ApprovalsEngine, Notice } from '../src/workflow/approvals-engine.service';
import { DayEngine } from '../src/time/day-engine.service';
import { LeaveService } from '../src/time/leave.service';
import { DEFAULT_RULES, LeaveRules, factsOn, todayIn } from '../src/time/time-core';
import { addDays, isWeeklyOff, instantAt } from '../src/time/time-maths';

// Step 4 · Time and leave batch 1 demo for Kaveri Foods (fictional throughout):
//   - holiday calendars 2026–27 for the Bengaluru head office (Karnataka), the Hosur plant and the Chennai office
//     (Tamil Nadu), with optional holidays (choose 2) and a half-day Christmas Eve; festival dates are demo dates that
//     HR confirms each year;
//   - shifts and weekly offs per location (Bengaluru: Sundays and the 2nd and 4th Saturday);
//   - leave types EL / CL / SL (medical) / LOP / CO / ML / PTL; a Karnataka and a Tamil Nadu policy, assigned per legal
//     entity from 1 Jan 2026, at or above the state Shops and Establishments floors (P07);
//   - balances from the accrual job, an opening carry-forward for Arjun, a comp-off credit for Divya;
//   - requests through the P03 engine: Arjun's approved casual leave, pending leave for Meera, Kiran, Kavya (sick,
//     medical reason) and Rahul, Divya's approved leave with Lakshmi approving for her while she is away;
//   - a week of web punches for Arjun (Bengaluru) and Kavya (Hosur, one missing check-out), evaluated by the day engine.
// Idempotent: skipped once the EL leave type exists.

type Tx = Prisma.TransactionClient;
export const TIME_PERMISSIONS = [
  { key: 'leave.settings.manage', description: 'Set up leave types, policies, holiday calendars, shifts and weekly offs, and run year end' },
  { key: 'leave.view', description: 'View leave requests, balances and the team leave calendar of the people in scope' },
  { key: 'leave.balance.adjust', description: 'Adjust leave balances of the people in scope, with a reason' },
  { key: 'leave.approve', description: 'Approve leave and attendance requests at the HR step for the people in scope' },
  { key: 'leave.medical.view', description: 'View medical leave reasons and certificates (Special, every view recorded)' },
  { key: 'attendance.view', description: 'View punches, days and the muster of the people in scope' },
];

type H = [string, string, string, boolean?];
const KA: H[] = [
  ['2026-01-01', "New Year's Day", 'festival'], ['2026-01-14', 'Makara Sankranti', 'festival'], ['2026-01-26', 'Republic Day', 'national'], ['2026-03-04', 'Holi', 'optional'],
  ['2026-03-19', 'Ugadi', 'state'], ['2026-03-20', 'Ramzan', 'optional'], ['2026-04-03', 'Good Friday', 'festival'], ['2026-05-01', 'May Day', 'state'], ['2026-05-27', 'Bakrid', 'optional'],
  ['2026-08-15', 'Independence Day', 'national'], ['2026-08-26', 'Onam', 'restricted'], ['2026-09-14', 'Ganesh Chaturthi', 'festival'], ['2026-10-02', 'Gandhi Jayanti', 'national'],
  ['2026-10-20', 'Vijayadashami', 'festival'], ['2026-11-01', 'Kannada Rajyotsava', 'state'], ['2026-11-09', 'Balipadyami', 'festival'], ['2026-12-24', 'Christmas Eve', 'festival', true],
  ['2026-12-25', 'Christmas', 'festival'],
  ['2027-01-01', "New Year's Day", 'festival'], ['2027-01-15', 'Makara Sankranti', 'festival'], ['2027-01-26', 'Republic Day', 'national'], ['2027-03-26', 'Good Friday', 'festival'],
  ['2027-04-07', 'Ugadi', 'state'], ['2027-05-01', 'May Day', 'state'], ['2027-08-15', 'Independence Day', 'national'], ['2027-09-04', 'Ganesh Chaturthi', 'festival'],
  ['2027-10-02', 'Gandhi Jayanti', 'national'], ['2027-10-09', 'Vijayadashami', 'festival'], ['2027-10-29', 'Deepavali', 'festival'], ['2027-11-01', 'Kannada Rajyotsava', 'state'],
  ['2027-12-25', 'Christmas', 'festival'],
];
const TN: H[] = [
  ['2026-01-01', "New Year's Day", 'festival'], ['2026-01-15', 'Pongal', 'state'], ['2026-01-16', 'Thiruvalluvar Day', 'state'], ['2026-01-26', 'Republic Day', 'national'],
  ['2026-03-20', 'Ramzan', 'optional'], ['2026-04-03', 'Good Friday', 'festival'], ['2026-04-14', 'Tamil New Year', 'state'], ['2026-05-01', 'May Day', 'state'], ['2026-05-27', 'Bakrid', 'optional'],
  ['2026-08-15', 'Independence Day', 'national'], ['2026-09-14', 'Vinayakar Chathurthi', 'festival'], ['2026-10-02', 'Gandhi Jayanti', 'national'], ['2026-10-19', 'Ayudha Pooja', 'festival'],
  ['2026-10-20', 'Vijayadashami', 'festival'], ['2026-11-08', 'Deepavali', 'festival'], ['2026-12-25', 'Christmas', 'festival'],
  ['2027-01-01', "New Year's Day", 'festival'], ['2027-01-15', 'Pongal', 'state'], ['2027-01-16', 'Thiruvalluvar Day', 'state'], ['2027-01-26', 'Republic Day', 'national'],
  ['2027-03-26', 'Good Friday', 'festival'], ['2027-04-14', 'Tamil New Year', 'state'], ['2027-05-01', 'May Day', 'state'], ['2027-08-15', 'Independence Day', 'national'],
  ['2027-09-04', 'Vinayakar Chathurthi', 'festival'], ['2027-10-02', 'Gandhi Jayanti', 'national'], ['2027-10-08', 'Ayudha Pooja', 'festival'], ['2027-10-28', 'Deepavali', 'festival'],
  ['2027-12-25', 'Christmas', 'festival'],
];

const rules = (r: Partial<LeaveRules>) => ({ ...DEFAULT_RULES, ...r }) as unknown as Prisma.InputJsonValue;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function seedTime(tx: Tx, organizationId: string) {
  const org = { organizationId };
  if (await tx.leaveType.findFirst({ where: { ...org, code: 'EL' } })) {
    // Seeded already: only bring the last week's days up to date (the day engine is idempotent).
    const c = { organizationId, isSuperAdmin: false, userId: null };
    for (const e of await tx.employee.findMany({ where: org, select: { id: true } })) await new DayEngine().evaluate(tx, c, e.id, addDays(todayIn('Asia/Kolkata'), -7), todayIn('Asia/Kolkata'));
    return;
  }
  const loc = async (code: string) => tx.location.findFirstOrThrow({ where: { ...org, code } });
  const blr = await loc('BLR-HO');
  const maa = await loc('MAA-OFF');
  const hosur = await loc('HSR-PLT');
  const user = async (email: string) => (await tx.user.findFirstOrThrow({ where: { ...org, email } })).id;
  const hr = await user('hr@demo-org.test');
  const divyaUser = await user('panel@demo-org.test');
  const emp = async (email: string) => tx.employee.findFirstOrThrow({ where: { ...org, workEmail: email } });

  // ---- holiday calendars ----
  for (const [l, name, list] of [[blr, 'Bengaluru holidays', KA], [hosur, 'Hosur plant holidays', TN], [maa, 'Chennai holidays', TN]] as const) {
    const cal = await tx.holidayCalendar.create({ data: { ...org, name, locationId: l.id, optionalLimit: 2, createdBy: hr } });
    await tx.holiday.createMany({ data: list.map(([on, n, kind, half]) => ({ ...org, calendarId: cal.id, holidayOn: day(on), name: n, kind, halfDay: Boolean(half), createdBy: hr })) });
  }

  // ---- shifts and weekly offs per location (Q1, Q3, Q6) ----
  const from = day('2026-01-01');
  await tx.locationAttendanceRule.createMany({
    data: [
      { ...org, locationId: blr.id, validFrom: from, shiftName: 'General', shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, weeklyOffs: [{ weekday: 7 }, { weekday: 6, nth: [2, 4] }], checkIn: 'restricted', createdBy: hr },
      { ...org, locationId: maa.id, validFrom: from, shiftName: 'General', shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, weeklyOffs: [{ weekday: 6 }, { weekday: 7 }], checkIn: 'restricted', createdBy: hr },
      { ...org, locationId: hosur.id, validFrom: from, shiftName: 'Plant day shift', shiftStart: 480, shiftEnd: 990, graceMinutes: 10, weeklyOffs: [{ weekday: 7 }], checkIn: 'restricted', createdBy: hr },
    ],
  });

  // ---- leave types (M02 A2) ----
  const type = async (code: string, name: string, kind: string, paid: boolean, colour: string, r: Partial<LeaveRules>) =>
    (await tx.leaveType.create({ data: { ...org, code, name, kind, paid, colour, rules: rules(r), createdBy: hr } })).id;
  const EL = await type('EL', 'Earned leave', 'earned', true, 'blue', { sandwich: 'sandwich', noticeDays: 3, maxDays: 15, hrApprovalAboveDays: 5, encashable: true });
  const CL = await type('CL', 'Casual leave', 'casual', true, 'green', { maxDays: 3 });
  const SL = await type('SL', 'Sick leave', 'sick', true, 'orange', { medical: true, certificateAfterDays: 2 });
  await type('LOP', 'Leave without pay', 'lop', false, 'grey', { hrApprovalAboveDays: 0 });
  await type('CO', 'Comp-off', 'comp_off', true, 'teal', { halfDays: true });
  await type('ML', 'Maternity leave', 'maternity', true, 'pink', { halfDays: false, sandwich: 'always', hrApprovalAboveDays: 0 });
  await type('PTL', 'Paternity leave', 'paternity', true, 'purple', { halfDays: false, maxDays: 5 });
  const CO = (await tx.leaveType.findFirstOrThrow({ where: { ...org, code: 'CO' } })).id;

  // ---- policies (P19 company rules, dated) assigned per legal entity (YX-ORG-18) ----
  const line = (leaveTypeId: string, annualDays: number, frequency: 'monthly' | 'yearly', carryForwardMax: number | null) => ({ leaveTypeId, annualDays, frequency, proRata: true, rounding: 0.5, carryForwardMax });
  const policy = async (name: string, lines: object[], scopeId: string) => {
    const p = await tx.leavePolicy.create({ data: { ...org, name, createdBy: hr } });
    await tx.leavePolicyVersion.create({ data: { ...org, policyId: p.id, validFrom: from, lines: lines as Prisma.InputJsonValue, note: 'Starter policy', createdBy: hr } });
    await tx.leavePolicyAssignment.create({ data: { ...org, policyId: p.id, scopeType: 'legal_entity', scopeId, validFrom: from, createdBy: hr } });
  };
  await policy('Karnataka staff', [line(EL, 18, 'monthly', 30), line(CL, 12, 'yearly', 0), line(SL, 12, 'yearly', 0)], blr.legalEntityId);
  await policy('Tamil Nadu staff', [line(EL, 15, 'monthly', 24), line(CL, 6, 'yearly', 0), line(SL, 6, 'yearly', 0)], hosur.legalEntityId);

  // ---- the shared engines, running inside this seed transaction ----
  const tenant = { forTenant: (_c: unknown, fn: (t: Tx) => unknown) => fn(tx) } as unknown as TenantPrismaService;
  const engine = new ApprovalsEngine(tenant, { notifySystem: async () => undefined } as never, { deliver: async () => undefined } as never);
  const days = new DayEngine();
  const leave = new LeaveService(null as never, tenant, engine, days);
  leave.onModuleInit();
  const c = { organizationId, isSuperAdmin: false, userId: null };

  // Balances: the accrual job up to today, then an opening carry-forward and a comp-off credit.
  await leave.accrue(organizationId);
  const arjun = await emp('arjun.kulkarni@kaverifoods.test');
  const divya = await emp('divya.raghunathan@kaverifoods.test');
  await tx.leaveLedgerEntry.create({ data: { ...org, employeeId: arjun.id, leaveTypeId: EL, entryOn: from, kind: 'opening', days: 6, reason: 'Opening balance: carried forward from 2025', createdBy: hr } });
  await tx.leaveLedgerEntry.create({ data: { ...org, employeeId: divya.id, leaveTypeId: CO, entryOn: day('2026-08-17'), kind: 'adjustment', days: 1, reason: 'Comp-off: worked on Independence Day for the plant audit', createdBy: hr } });

  // Working days relative to today (Bengaluru calendar), so the demo stays current whenever it is seeded.
  const today = todayIn('Asia/Kolkata');
  const off = (d: string) => isWeeklyOff(d, [{ weekday: 7 }, { weekday: 6 }]) || KA.some(([h, , k]) => h === d && k !== 'optional' && k !== 'restricted');
  const workday = (n: number) => {
    let d = today;
    for (let k = 0; k < Math.abs(n); ) {
      d = addDays(d, Math.sign(n));
      if (!off(d)) k++;
    }
    return d;
  };
  const notices: Notice[] = [];
  const apply = async (email: string, dto: { leaveTypeId: string; from: string; to: string; reason?: string; delegateUserId?: string; certificate?: boolean }) => {
    const e = await emp(email);
    const f = await factsOn(tx, organizationId, e.id, today);
    if (!f) throw new Error(`no facts for ${email}`);
    // Raised by the employee themselves when they have a login (so they never approve it, YX-WF-04).
    return leave.applyIn(tx, { ...c, userId: e.userId ?? null }, f, today, dto, notices);
  };
  const approve = async (wfRequestId: string, approverUserId: string) => {
    const task = await tx.wfTask.findFirstOrThrow({ where: { ...org, requestId: wfRequestId, assigneeUserId: approverUserId, status: 'open' } });
    await engine.decide({ organizationId, isSuperAdmin: false, userId: approverUserId }, approverUserId, task.id, 'approve', null);
  };

  const past = await apply('arjun.kulkarni@kaverifoods.test', { leaveTypeId: CL, from: workday(-12), to: workday(-12), reason: 'Family function in Mysuru' });
  await approve(past.wfRequestId, divyaUser);
  await apply('meera.iyer@kaverifoods.test', { leaveTypeId: CL, from: workday(5), to: workday(5), reason: 'Bank and passport office work' });
  await apply('kiran.joshi@kaverifoods.test', { leaveTypeId: EL, from: workday(8), to: workday(9), reason: 'Sister’s wedding' });
  await apply('kavya.reddy@kaverifoods.test', { leaveTypeId: SL, from: workday(1), to: workday(2), reason: 'Fever; doctor advised two days of rest' });
  await apply('rahul.sharma@kaverifoods.test', { leaveTypeId: EL, from: workday(12), to: workday(14), reason: 'Trip home to Jaipur' });
  const away = await apply('divya.raghunathan@kaverifoods.test', { leaveTypeId: EL, from: workday(15), to: workday(16), reason: 'Long weekend with family', delegateUserId: hr });
  // Divya's manager has no login, so HR (Lakshmi) approves; Lakshmi then approves for Divya while she is away.
  await approve(away.wfRequestId, hr);

  // ---- a week of web punches (inside the geofence), evaluated by the day engine ----
  const kavya = await emp('kavya.reddy@kaverifoods.test');
  const punch = (employeeId: string, on: string, minute: number, kind: 'in' | 'out', l: typeof blr, offsetM: number) => ({
    ...org,
    employeeId,
    punchedAt: instantAt(on, 'Asia/Kolkata', minute),
    workOn: day(on),
    kind,
    source: 'web',
    accepted: true,
    lat: Number(l.geoLat) + offsetM / 111_000,
    lng: Number(l.geoLng),
    accuracyM: 18,
    distanceM: offsetM,
    verdict: 'inside',
    locationId: l.id,
    device: 'Chrome on Windows',
  });
  const rows = [];
  for (let k = 7; k >= 1; k--) {
    const on = addDays(today, -k);
    if (!isWeeklyOff(on, [{ weekday: 7 }]) && !TN.some(([h]) => h === on)) {
      rows.push(punch(kavya.id, on, 475 + k, 'in', hosur, 40));
      // One missing check-out (YX-AT-03: shown as "missing check-out", fixed through a regularisation).
      if (k !== 3) rows.push(punch(kavya.id, on, 995 + k, 'out', hosur, 35));
    }
    if (!off(on)) {
      rows.push(punch(arjun.id, on, k === 2 ? 600 : 565 + k, 'in', blr, 60));
      rows.push(punch(arjun.id, on, 1115 + 3 * k, 'out', blr, 55));
    }
  }
  await tx.punch.createMany({ data: rows });
  const everyone = await tx.employee.findMany({ where: org, select: { id: true } });
  for (const e of everyone) await days.evaluate(tx, c, e.id, addDays(today, -7), today);
  void notices;
}
