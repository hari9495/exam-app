// Fictional, deterministic sample data for the wired Time screens' design stories. Kaveri Foods Pvt Ltd, 28 Oct 2026.
import type { DayCard, DayRow, HrBalances, LeaveBalanceRow, LeavePlan, LedgerRow, Muster, MyLeave, MyOvertime, MyShifts, MyTimesheet, OtReview, PayrollFeed, Periods, Preflight, RosterWeek, ShiftSetup, TeamCalendar, TimeSetup, YearEndPreview } from './types';

export const TODAY = '2026-10-28';
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ Me › Leave
const bal = (leaveTypeId: string, code: string, name: string, kind: string, colour: string, available: number, entitlement: number | null, pending = 0): LeaveBalanceRow => ({
  leaveTypeId, code, name, kind, colour, paid: kind !== 'lop', hasBalance: kind !== 'lop', balance: available + pending, pending, available, takenThisYear: kind === 'lop' ? 2 : 0, entitlement, negativeLimit: 0,
});
export const BALANCES: LeaveBalanceRow[] = [
  bal('el', 'EL', 'Earned leave', 'earned', 'blue', 14, 18, 2),
  bal('cl', 'CL', 'Casual leave', 'casual', 'teal', 5, 8),
  bal('sl', 'SL', 'Sick leave', 'sick', 'amber', 6, 7),
  bal('lop', 'LOP', 'Leave without pay', 'lop', 'grey', 0, null),
];
export const MY_LEAVE: MyLeave = {
  employee: { id: 'e-arjun', name: 'Arjun Kulkarni', code: 'KF-0142' },
  today: TODAY,
  year: { start: '2026-01-01', end: '2026-12-31' },
  balances: BALANCES,
  requests: [
    { id: 'r1', employeeId: 'e-arjun', type: { id: 'el', code: 'EL', name: 'Earned leave', colour: 'blue', medical: false }, from: '2026-11-16', to: '2026-11-17', fromHalf: 'full', toHalf: 'full', days: 2, status: 'pending', certificate: 'none', reason: 'Sister’s wedding in Mysuru', createdAt: '2026-10-26T09:10:00Z', decidedAt: null },
    { id: 'r2', employeeId: 'e-arjun', type: { id: 'cl', code: 'CL', name: 'Casual leave', colour: 'teal', medical: false }, from: '2026-11-03', to: '2026-11-03', fromHalf: 'full', toHalf: 'full', days: 1, status: 'approved', certificate: 'none', reason: null, createdAt: '2026-10-20T05:00:00Z', decidedAt: '2026-10-20T08:00:00Z' },
    { id: 'r3', employeeId: 'e-arjun', type: { id: 'sl', code: 'SL', name: 'Sick leave', colour: 'amber', medical: true }, from: '2026-09-14', to: '2026-09-15', fromHalf: 'full', toHalf: 'full', days: 2, status: 'approved', certificate: 'verified', reason: null, createdAt: '2026-09-16T04:00:00Z', decidedAt: '2026-09-16T06:00:00Z' },
    { id: 'r4', employeeId: 'e-arjun', type: { id: 'el', code: 'EL', name: 'Earned leave', colour: 'blue', medical: false }, from: '2026-08-24', to: '2026-08-24', fromHalf: 'full', toHalf: 'full', days: 1, status: 'withdrawn', certificate: 'none', reason: null, createdAt: '2026-08-10T04:00:00Z', decidedAt: null },
  ],
  holidays: {
    calendar: { id: 'cal-blr', name: 'Bengaluru head office holidays', optionalLimit: 2 },
    list: [
      { id: 'h1', on: '2026-11-01', name: 'Kannada Rajyotsava', kind: 'state', halfDay: false },
      { id: 'h2', on: '2026-11-09', name: 'Balipadyami', kind: 'festival', halfDay: false },
      { id: 'h3', on: '2026-11-27', name: 'Kanakadasa Jayanti', kind: 'optional', halfDay: false, chosen: false },
      { id: 'h4', on: '2026-12-25', name: 'Christmas', kind: 'optional', halfDay: false, chosen: true },
    ],
  },
};
export const LEAVE_PLAN: LeavePlan = {
  type: { id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', rules: { certificateAfterDays: null, medical: false, halfDays: true } },
  days: [],
  total: 2,
  holidaysExcluded: 0,
  sandwichDays: 0,
  balance: BALANCES[0]!,
  balanceAfter: 12,
  othersOff: 1,
  certificateNeeded: false,
  blocks: [],
  warnings: [],
};
export const PEOPLE_OPTIONS = [
  { id: 'u-divya', label: 'Divya Raghunathan', detail: 'Quality Manager' },
  { id: 'u-pooja', label: 'Pooja Iyengar', detail: 'Quality Analyst' },
];

// ------------------------------------------------------------------ Team leave, muster, balances
export const TEAM_CALENDAR: TeamCalendar = {
  from: '2026-10-26',
  to: '2026-11-22',
  scope: 'team',
  people: [
    { id: 'e-divya', name: 'Divya Raghunathan', code: 'KF-0101', me: true, holidays: [{ on: '2026-11-01', name: 'Kannada Rajyotsava', halfDay: false }, { on: '2026-11-09', name: 'Balipadyami', halfDay: false }], days: [] },
    { id: 'e-arjun', name: 'Arjun Kulkarni', code: 'KF-0142', me: false, holidays: [{ on: '2026-11-01', name: 'Kannada Rajyotsava', halfDay: false }, { on: '2026-11-09', name: 'Balipadyami', halfDay: false }], days: [{ on: '2026-11-03', part: 'full', status: 'approved', code: 'CL', colour: 'teal', name: 'Casual leave' }, { on: '2026-11-16', part: 'full', status: 'pending', code: 'EL', colour: 'blue', name: 'Earned leave' }, { on: '2026-11-17', part: 'full', status: 'pending', code: 'EL', colour: 'blue', name: 'Earned leave' }] },
    { id: 'e-sanjay', name: 'Sanjay Rao', code: 'KF-0131', me: false, holidays: [{ on: '2026-11-01', name: 'Kannada Rajyotsava', halfDay: false }], days: [{ on: '2026-10-29', part: 'full', status: 'approved', code: 'EL', colour: 'blue', name: 'Earned leave' }, { on: '2026-10-30', part: 'first', status: 'approved', code: 'CL', colour: 'teal', name: 'Casual leave' }] },
    { id: 'e-gopal', name: 'Gopal Iyer', code: 'KF-0144', me: false, holidays: [{ on: '2026-11-01', name: 'Kannada Rajyotsava', halfDay: false }], days: [{ on: '2026-11-10', part: 'full', status: 'pending', code: 'SL', colour: 'amber', name: 'Sick leave' }] },
  ],
};

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const dayRow = (on: string, i: number, twist: Partial<Record<number, DayRow['status']>> = {}): DayRow => {
  const status: DayRow['status'] = on > TODAY ? 'not_started' : weekday(on) === 0 ? 'weekly_off' : on === '2026-10-02' ? 'holiday' : (twist[Number(on.slice(8))] ?? 'present');
  return { on, status, leavePart: status === 'leave' ? 'full' : null, firstIn: status === 'present' ? `${on}T03:5${i % 10}:00Z` : null, lastOut: status === 'present' ? `${on}T12:4${i % 10}:00Z` : null, workedMinutes: status === 'present' ? 520 : status === 'half_day' ? 250 : null, lateMinutes: 0, regularised: false };
};
export const MUSTER: Muster = {
  month: '2026-10',
  from: '2026-10-01',
  to: '2026-10-31',
  scope: 'team',
  people: [
    { id: 'e-arjun', name: 'Arjun Kulkarni', code: 'KF-0142', location: 'Bengaluru head office', me: false, mode: 'punch', missingPunchEffect: 'block', days: MONTH_DAYS.map((d, i) => dayRow(d, i, { 12: 'missing_out', 20: 'leave' })) },
    { id: 'e-sanjay', name: 'Sanjay Rao', code: 'KF-0131', location: 'Hosur plant', me: false, mode: 'punch', missingPunchEffect: 'warning_only', remindedOn: ['2026-10-15'], days: MONTH_DAYS.map((d, i) => dayRow(d, i, { 6: 'half_day', 14: 'missing_in', 22: 'absent' })) },
    { id: 'e-gopal', name: 'Gopal Iyer', code: 'KF-0144', location: 'Hosur plant', me: false, mode: 'assumed_present', missingPunchEffect: 'warning_only', days: MONTH_DAYS.map((d, i) => dayRow(d, i, { 8: 'leave', 9: 'leave' })) },
  ],
};
export const DAY_CARD: DayCard = {
  person: { name: 'Arjun Kulkarni', code: 'KF-0142' },
  on: '2026-10-12',
  zone: 'Asia/Kolkata',
  day: { status: 'missing_out', leavePart: null, firstIn: '2026-10-12T03:55:00Z', lastOut: null, workedMinutes: null, lateMinutes: 0, regularised: false },
  punches: [{ id: 'p1', kind: 'in', at: '2026-10-12T03:55:00Z', source: 'web', accepted: true, refusal: null, verdict: 'inside', distanceM: 40, accuracyM: 20, where: 'Bengaluru head office', minute: 565 }],
};
export const HR_BALANCES: HrBalances = {
  types: [{ id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned' }, { id: 'cl', code: 'CL', name: 'Casual leave', kind: 'casual' }, { id: 'sl', code: 'SL', name: 'Sick leave', kind: 'sick' }, { id: 'lop', code: 'LOP', name: 'Leave without pay', kind: 'lop' }],
  people: [
    { employeeId: 'e-arjun', name: 'Arjun Kulkarni', code: 'KF-0142', canAdjust: true, balances: BALANCES },
    { employeeId: 'e-sanjay', name: 'Sanjay Rao', code: 'KF-0131', canAdjust: true, balances: [bal('el', 'EL', 'Earned leave', 'earned', 'blue', 9.5, 18), bal('cl', 'CL', 'Casual leave', 'casual', 'teal', 3, 8), bal('sl', 'SL', 'Sick leave', 'sick', 'amber', 7, 7)] },
    { employeeId: 'e-divya', name: 'Divya Raghunathan', code: 'KF-0101', canAdjust: false, balances: [bal('el', 'EL', 'Earned leave', 'earned', 'blue', 21, 18), bal('cl', 'CL', 'Casual leave', 'casual', 'teal', 6, 8), bal('sl', 'SL', 'Sick leave', 'sick', 'amber', 7, 7)] },
  ],
};
export const LEDGER: LedgerRow[] = [
  { id: 'l1', on: '2026-01-01', type: 'Earned leave', kind: 'carry_forward', days: 6, reason: 'Carried from 2025' },
  { id: 'l2', on: '2026-10-01', type: 'Earned leave', kind: 'accrual', days: 1.5, reason: 'October credit' },
  { id: 'l3', on: '2026-11-03', type: 'Casual leave', kind: 'debit', days: -1, reason: 'Leave on 3 Nov 2026' },
];

// ------------------------------------------------------------------ HR set-up
const RULES = { sandwich: 'sandwich' as const, sandwichOn: 'both' as const, sandwichHalfDays: false, halfDays: true, minDays: null, maxDays: null, noticeDays: 3, certificateAfterDays: null, medical: false, negativeLimit: 0, encashable: true, hrApprovalAboveDays: 10 };
export const TIME_SETUP: TimeSetup = {
  today: TODAY,
  types: [
    { id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', paid: true, colour: 'blue', active: true, rules: RULES },
    { id: 'cl', code: 'CL', name: 'Casual leave', kind: 'casual', paid: true, colour: 'teal', active: true, rules: { ...RULES, sandwich: 'none', encashable: false, noticeDays: 0 } },
    { id: 'sl', code: 'SL', name: 'Sick leave', kind: 'sick', paid: true, colour: 'amber', active: true, rules: { ...RULES, sandwich: 'none', encashable: false, noticeDays: 0, certificateAfterDays: 2, medical: true } },
    { id: 'lop', code: 'LOP', name: 'Leave without pay', kind: 'lop', paid: false, colour: 'grey', active: true, rules: { ...RULES, sandwich: 'none', encashable: false } },
  ],
  policies: [
    {
      id: 'pol-std',
      name: 'Kaveri Foods standard',
      archived: false,
      versions: [{ id: 'v1', validFrom: '2026-01-01', note: null, lines: [{ leaveTypeId: 'el', annualDays: 18, frequency: 'monthly', proRata: true, rounding: 0.5, carryForwardMax: 30 }, { leaveTypeId: 'cl', annualDays: 8, frequency: 'yearly', proRata: true, rounding: 0.5, carryForwardMax: null }, { leaveTypeId: 'sl', annualDays: 7, frequency: 'yearly', proRata: true, rounding: 0.5, carryForwardMax: null }] }],
      assignments: [{ id: 'a1', scopeType: 'company', scopeId: 'org', scopeName: 'Whole company', validFrom: '2026-01-01', removable: false }],
    },
    {
      id: 'pol-plant',
      name: 'Hosur plant (Factories Act)',
      archived: false,
      versions: [{ id: 'v2', validFrom: '2026-04-01', note: 'One day for every 20 days worked', lines: [{ leaveTypeId: 'el', annualDays: 15, frequency: 'monthly', proRata: true, rounding: 0.5, carryForwardMax: 30 }] }],
      assignments: [{ id: 'a2', scopeType: 'location', scopeId: 'loc-hosur', scopeName: 'Hosur plant', validFrom: '2026-04-01', removable: true }],
    },
  ],
  calendars: [
    { id: 'cal-blr', name: 'Bengaluru head office holidays', locationId: 'loc-blr', halfDayOpenHalf: 'first', optionalLimit: 2, holidays: MY_LEAVE.holidays.list },
  ],
  locations: [
    { id: 'loc-blr', name: 'Bengaluru head office', state: 'IN-KA', timezone: 'Asia/Kolkata', geofence: { lat: 12.97, lng: 77.59, radiusM: 150 }, ipRanges: ['10.20.0.0/16'], rule: { validFrom: '2026-01-01', shiftName: 'General', shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, weeklyOffs: [{ weekday: 7 }, { weekday: 6, nth: [2, 4] }], checkIn: 'restricted' }, upcoming: [] },
    { id: 'loc-hosur', name: 'Hosur plant', state: 'IN-TN', timezone: 'Asia/Kolkata', geofence: { lat: 12.74, lng: 77.83, radiusM: 300 }, ipRanges: [], rule: { validFrom: '2026-01-01', shiftName: 'Morning', shiftStart: 360, shiftEnd: 870, graceMinutes: 5, weeklyOffs: [{ weekday: 7 }], checkIn: 'restricted' }, upcoming: [{ validFrom: '2026-12-01', shiftName: 'Morning', shiftStart: 360, shiftEnd: 870, graceMinutes: 10, weeklyOffs: [{ weekday: 7 }], checkIn: 'restricted' }] },
  ],
  entities: [{ id: 'le-kfpl', name: 'Kaveri Foods Pvt Ltd' }, { id: 'le-tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }],
  statutory: [{ jurisdiction: 'IN-TN', version: '2026.1', validFrom: '2026-01-01', values: { floors: [{ kinds: ['earned'], days: 12 }] }, source: 'Tamil Nadu Shops and Establishments Act', verify: false }],
};
export const YEAR_END: YearEndPreview = {
  yearEnd: '2026-12-31',
  lapses: 3.5,
  rows: [
    { employeeId: 'e-divya', name: 'Divya Raghunathan', code: 'KF-0101', type: 'Earned leave', balance: 33.5, carry: 30, lapse: 3.5, encashable: true },
    { employeeId: 'e-arjun', name: 'Arjun Kulkarni', code: 'KF-0142', type: 'Earned leave', balance: 14, carry: 14, lapse: 0, encashable: true },
  ],
};

// ------------------------------------------------------------------ Roster and my shifts
const WEEK = '2026-10-26';
const SHIFTS = [
  { id: 's-m', code: 'M', name: 'Morning', colour: 'teal', night: false, start: 360, end: 870 },
  { id: 's-e', code: 'E', name: 'Evening', colour: 'amber', night: false, start: 840, end: 1350 },
  { id: 's-n', code: 'N', name: 'Night', colour: 'violet', night: true, start: 1320, end: 390 },
];
const ref = (id: string) => {
  const s = SHIFTS.find((x) => x.id === id)!;
  return { shiftId: s.id, name: s.name, start: s.start, end: s.end };
};
const rosterRow = (id: string, name: string, code: string, plan: string[]) => ({
  id,
  name,
  code,
  cells: plan.map((v, i) => {
    const on = addDays(WEEK, i);
    return { on, employed: true, past: on < TODAY, published: v === 'off' ? 'off' : v, source: 'roster' as const, effective: v === 'off' ? null : ref(v), planned: v === 'off' ? null : ref(v), conflicts: [] };
  }),
});
export const ROSTER: RosterWeek = {
  week: WEEK,
  to: addDays(WEEK, 6),
  today: TODAY,
  scope: 'team',
  shifts: SHIFTS,
  drafts: 2,
  people: [
    rosterRow('e-kavitha', 'Kavitha Sundaram', 'KF-0177', ['s-m', 's-m', 's-m', 's-m', 's-m', 's-m', 'off']),
    { ...rosterRow('e-rekha', 'Rekha Balan', 'KF-0182', ['s-e', 's-e', 's-e', 's-n', 's-n', 'off', 'off']), cells: rosterRow('e-rekha', 'Rekha Balan', 'KF-0182', ['s-e', 's-e', 's-e', 's-n', 's-n', 'off', 'off']).cells.map((c) => (c.on === '2026-10-29' ? { ...c, draft: 's-m', conflicts: [{ on: c.on, kind: 'rest' as const, message: 'Less than 12 hours of rest after the evening shift on Wed 28 Oct.' }] } : c)) },
    rosterRow('e-anil', 'Anil Kumar', 'KF-0190', ['s-n', 's-n', 'off', 's-m', 's-m', 's-m', 's-m']),
  ],
};
export const MY_SHIFTS: MyShifts = {
  week: WEEK,
  days: ['s-m', 's-m', 's-m', 's-m', 's-m', 's-m', 'off'].map((v, i) => ({ on: addDays(WEEK, i), shift: v === 'off' ? null : ref(v), off: v === 'off', employed: true })),
  colleagues: [{ id: 'e-rekha', name: 'Rekha Balan' }, { id: 'e-anil', name: 'Anil Kumar' }],
  swaps: [
    { id: 'sw1', on: '2026-10-31', mine: true, with: 'Rekha Balan', status: 'pending', reason: 'Family function in Krishnagiri' },
    { id: 'sw2', on: '2026-10-17', mine: true, with: 'Anil Kumar', status: 'approved', reason: 'Bank visit in the morning' },
  ],
};

// ------------------------------------------------------------------ Shifts set-up
export const SHIFT_SETUP: ShiftSetup = {
  today: TODAY,
  shifts: SHIFTS.map((s) => ({ id: s.id, code: s.code, name: s.name, colour: s.colour, night: s.night, active: true, versions: [{ validFrom: '2026-01-01', start: s.start, end: s.end, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 30, breakAboveMinutes: 300 }] })),
  patterns: [
    { id: 'pt1', name: 'Hosur 3-shift rotation', kind: 'cycle', cycle: ['s-m', 's-m', 's-e', 's-e', 's-n', 's-n', null, null], active: true, assignments: [{ id: 'pa1', scopeType: 'location', scopeId: 'loc-hosur', scopeName: 'Hosur plant', validFrom: '2026-04-01', offsetDays: 0, removable: true }] },
    { id: 'pt2', name: 'Head office week', kind: 'weekly', cycle: [null, null, null, null, null, null, null], active: true, assignments: [] },
  ],
  otRules: [
    { id: 'ot1', name: 'Hosur plant overtime', scopeType: 'location', scopeId: 'loc-hosur', scopeName: 'Hosur plant', validFrom: '2026-01-01', minMinutes: 30, roundMinutes: 15, dailyCapMinutes: 240, rateNormal: 2, rateWeeklyOff: 2, rateHoliday: 2, needsApproval: true, settle: 'pay', compOffHalfMinutes: 240, compOffFullMinutes: 480, removable: true },
  ],
  projects: [
    { id: 'pr1', code: 'FSSAI', name: 'FSSAI audit readiness', managerUserId: 'u-divya', managerName: 'Divya Raghunathan', billable: false, activities: ['Documentation', 'Line checks'], active: true },
    { id: 'pr2', code: 'NEWLINE', name: 'Hosur line 4 commissioning', managerUserId: 'u-ramesh', managerName: 'Ramesh Gowda', billable: true, activities: ['Installation', 'Trials'], active: true },
  ],
  night: {
    locations: [{ locationId: 'loc-hosur', name: 'Hosur plant', window: { start: 1200, end: 360 }, items: [{ item: 'transport', label: 'Transport home', attestedOn: '2026-07-01', reviewDue: '2027-01-01', note: 'Two cabs on contract', ok: true }, { item: 'security', label: 'Security at the gate', attestedOn: null, reviewDue: null, note: null, ok: false }] }],
    consents: [{ id: 'nc1', employeeId: 'e-rekha', name: 'Rekha Balan', locationId: 'loc-hosur', location: 'Hosur plant', givenOn: '2026-07-01', withdrawnOn: null, reference: 'Form 14 · KF/NW/2026/031', confirmedAt: '2026-07-02T05:00:00Z' }],
    optIns: [{ employeeId: 'e-kavitha', name: 'Kavitha Sundaram', since: '2026-08-12' }],
  },
  hasCompOffType: true,
  locations: [{ id: 'loc-blr', name: 'Bengaluru head office', state: 'IN-KA' }, { id: 'loc-hosur', name: 'Hosur plant', state: 'IN-TN' }],
  departments: [{ id: 'd-q', name: 'Quality' }, { id: 'd-ops', name: 'Operations' }],
  entities: TIME_SETUP.entities,
  people: [{ id: 'e-rekha', name: 'Rekha Balan', code: 'KF-0182' }, { id: 'e-kavitha', name: 'Kavitha Sundaram', code: 'KF-0177' }],
  users: [{ id: 'u-divya', name: 'Divya Raghunathan' }, { id: 'u-ramesh', name: 'Ramesh Gowda' }],
};

// ------------------------------------------------------------------ Overtime
export const MY_OVERTIME: MyOvertime = {
  today: TODAY,
  open: [
    { on: '2026-10-26', category: 'normal', workedMinutes: 630, scheduledMinutes: 480, eligibleMinutes: 150, payableMinutes: 150, overCapMinutes: 0, settle: 'pay', factoriesAct: true, needsApproval: true },
    { on: '2026-10-25', category: 'weekly_off', workedMinutes: 300, scheduledMinutes: 0, eligibleMinutes: 300, payableMinutes: 240, overCapMinutes: 60, settle: 'pay', factoriesAct: true, needsApproval: true },
  ],
  claims: [
    { id: 'oc1', employeeId: 'e-kavitha', on: '2026-10-19', category: 'normal', workedMinutes: 600, scheduledMinutes: 480, eligibleMinutes: 120, payableMinutes: 120, overCapMinutes: 0, rate: 2, settle: 'pay', compOffDays: 0, reason: 'Line 2 changeover ran late', status: 'pending', overridden: false, overrideReason: null },
    { id: 'oc2', employeeId: 'e-kavitha', on: '2026-10-05', category: 'normal', workedMinutes: 570, scheduledMinutes: 480, eligibleMinutes: 90, payableMinutes: 90, overCapMinutes: 0, rate: 2, settle: 'pay', compOffDays: 0, reason: 'Festival dispatch', status: 'approved', overridden: false, overrideReason: null },
  ],
};
export const OT_REVIEW: OtReview = {
  month: '2026-10',
  scope: 'team',
  claims: [
    { ...MY_OVERTIME.claims[0]!, name: 'Kavitha Sundaram', code: 'KF-0177', canOverride: false },
    { id: 'oc3', employeeId: 'e-anil', on: '2026-10-25', category: 'weekly_off', workedMinutes: 360, scheduledMinutes: 0, eligibleMinutes: 360, payableMinutes: 240, overCapMinutes: 120, rate: 2, settle: 'pay', compOffDays: 0, reason: 'Boiler breakdown call-out', status: 'approved', overridden: false, overrideReason: null, name: 'Anil Kumar', code: 'KF-0190', canOverride: true },
    { ...MY_OVERTIME.claims[1]!, name: 'Kavitha Sundaram', code: 'KF-0177' },
  ],
};

// ------------------------------------------------------------------ Timesheet
export const MY_TIMESHEET: MyTimesheet = {
  week: WEEK,
  mode: 'timesheet',
  sheet: { id: 'ts1', status: 'draft', totalMinutes: 1200 },
  lines: [
    { id: 'tl1', projectId: 'pr1', activity: 'Documentation', billable: false, minutes: [240, 240, 120, 0, 0, 0, 0], note: null },
    { id: 'tl2', projectId: 'pr2', activity: 'Trials', billable: true, minutes: [240, 240, 120, 0, 0, 0, 0], note: null },
  ],
  projects: SHIFT_SETUP.projects.map(({ id, code, name, billable, activities, active }) => ({ id, code, name, billable, activities, active })),
  days: Array.from({ length: 7 }, (_, i) => ({ on: addDays(WEEK, i), holiday: null, leave: null, locked: false })),
  recent: [{ id: 'ts0', week: '2026-10-19', status: 'approved', totalMinutes: 2400 }, { id: 'tsm', week: '2026-10-12', status: 'approved', totalMinutes: 2280 }],
};

// ------------------------------------------------------------------ Periods and the payroll feed
export const PERIODS: Periods = {
  year: '2026',
  today: TODAY,
  entities: [
    {
      id: 'le-kfpl',
      name: 'Kaveri Foods Pvt Ltd',
      months: [
        { month: '2026-07', stage: 'filed', changedAt: '2026-08-02T06:00:00Z', changedBy: 'Lakshmi Narayan', reason: null, lockable: true },
        { month: '2026-08', stage: 'locked', changedAt: '2026-09-02T06:00:00Z', changedBy: 'Lakshmi Narayan', reason: null, lockable: true },
        { month: '2026-09', stage: 'open', changedAt: null, changedBy: null, reason: null, lockable: true },
        { month: '2026-10', stage: 'open', changedAt: null, changedBy: null, reason: null, lockable: false },
      ],
    },
    {
      id: 'le-tn',
      name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
      months: [
        { month: '2026-08', stage: 'locked', reopenAsked: true, changedAt: '2026-09-03T06:00:00Z', changedBy: 'Lakshmi Narayan', reason: null, lockable: true },
        { month: '2026-09', stage: 'locked', changedAt: '2026-10-02T06:00:00Z', changedBy: 'Lakshmi Narayan', reason: null, lockable: true },
        { month: '2026-10', stage: 'open', changedAt: null, changedBy: null, reason: null, lockable: false },
      ],
    },
  ],
};
export const PREFLIGHT_READY: Preflight = { month: '2026-09', lockableFrom: '2026-10-02', people: 214, pending: [], exceptions: 0 };
export const PREFLIGHT_BLOCKED: Preflight = { month: '2026-09', lockableFrom: '2026-10-02', people: 214, pending: [{ kind: 'Leave requests', count: 3 }, { kind: 'Overtime claims', count: 1 }], exceptions: 5 };
export const PAYROLL_FEED: PayrollFeed = {
  entity: { id: 'le-tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
  month: '2026-09',
  frozen: true,
  lockedAt: '2026-10-02T06:00:00Z',
  rows: [
    { employeeId: 'e-kavitha', name: 'Kavitha Sundaram', code: 'KF-0177', mode: 'punch', calendarDays: 30, paidDays: 30, lopDays: 0, otNormalMinutes: 210, otWeeklyOffMinutes: 0, otHolidayMinutes: 0, nightShifts: 0, compOffDays: 0, timesheetMinutes: 0, unevaluatedDays: 0 },
    { employeeId: 'e-rekha', name: 'Rekha Balan', code: 'KF-0182', mode: 'punch', calendarDays: 30, paidDays: 29.5, lopDays: 0.5, otNormalMinutes: 90, otWeeklyOffMinutes: 0, otHolidayMinutes: 0, nightShifts: 7, compOffDays: 0.5, timesheetMinutes: 0, unevaluatedDays: 0 },
    { employeeId: 'e-anil', name: 'Anil Kumar', code: 'KF-0190', mode: 'punch', calendarDays: 30, paidDays: 30, lopDays: 0, otNormalMinutes: 0, otWeeklyOffMinutes: 360, otHolidayMinutes: 0, nightShifts: 9, compOffDays: 0, timesheetMinutes: 0, unevaluatedDays: 1 },
  ],
};
