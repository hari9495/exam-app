// Fictional, deterministic sample data for the Time screens (M02). Kaveri Foods Pvt Ltd.
import { HR_ADMIN, LOCATIONS, ME, PAYROLL_ADMIN, TODAY } from '../_kit/data';
import { MEERA } from '../people/people-data';
import { fmtDuration, otCapFlag, toMin, type AttendanceDay, type DayCode, type Fence, type Punch } from './time-logic';

export { TODAY, ME, LOCATIONS, HR_ADMIN, PAYROLL_ADMIN };

/** Who is looking at a Time page (TimePage `user`): ME (employee + manager of t1–t8), HR_ADMIN or PAYROLL_ADMIN. */
export type TimeUser = {
  name: string;
  email: string;
  role?: string;
  /** What the Time nav shows (default from the data, see `timeScope`). */
  scope?: 'employee' | 'manager' | 'admin';
};

/** Clock-in fences: every location already open (the Madurai depot opens 1 Nov). */
export const FENCES: Fence[] = LOCATIONS.filter((l) => !l.opens || l.opens <= TODAY).map((l) => ({ name: l.name, lat: l.lat, lng: l.lng, radiusM: l.radiusM }));

export const GENERAL_SHIFT = { code: 'G', name: 'General', start: '09:30', end: '18:30', graceMin: 10, opensBeforeMin: 60, breakRule: '30 min unpaid break above 5 h' };

/**
 * The payroll a late request (a change to a locked or freezing month) lands in: September freezes 30 Sep and a late
 * request also needs HR, so it goes to the next month's run, October. One source for every Time screen.
 */
export const LATE_PAYROLL = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1).toLocaleDateString('en-IN', { month: 'long' });

/** Minutes since midnight at TODAY (9:42 am). */
export const NOW_MIN = TODAY.getHours() * 60 + TODAY.getMinutes();

export const TODAY_PUNCHES: Punch[] = [
  { id: 'p1', kind: 'in', time: '09:38', source: 'web', where: 'Chennai office · Wi-Fi KF-Taramani-5F', verdict: 'network', device: 'Chrome on Windows' },
];

export const FULL_DAY_PUNCHES: Punch[] = [
  // Today's web clock-in (TODAY_PUNCHES), so every screen shows the same check-in.
  { ...TODAY_PUNCHES[0], id: 'q1' },
  { id: 'q2', kind: 'break_start', time: '13:15', source: 'web', where: 'Chennai office · IP 10.20.4.17', verdict: 'network' },
  { id: 'q3', kind: 'break_end', time: '13:52', source: 'web', where: 'Chennai office · IP 10.20.4.17', verdict: 'network' },
  { id: 'q4', kind: 'out', time: '18:41', source: 'mobile', where: 'Chennai office', distanceM: 40, verdict: 'inside', device: 'Pixel 7a (bound)' },
];

const d = (day: number) => new Date(2026, 8, day);

/** The day Divya can claim as comp-off (TIM-22) and the timesheet shows (TIM-31): Sat 26 Sep, her 4th-Saturday weekly off. */
export const CLAIM = { date: new Date(2026, 8, 26), kind: 'weekly off', in: '09:40', out: '14:10', where: 'Chennai office', useBy: new Date(2026, 9, 26) };
const CLAIM_MIN = toMin(CLAIM.out) - toMin(CLAIM.in);

/**
 * Comp-off claims sent for a manager's approval (TIM-22). The story world starts before the 26 Sep claim is sent (TIM-22
 * "ready"); the Sent story adds it on the page. Declared before SEPTEMBER, whose 26 Sep note reads it.
 */
export interface CompOffRequest { id: string; person: string; worked: Date; days: number; status: 'Pending' | 'Approved' | 'Rejected'; applied: Date; approver: string; useBy: Date; reason: string }
export const COMP_OFF_REQUESTS: CompOffRequest[] = [];
const claimSent = (date: Date) => COMP_OFF_REQUESTS.some((r) => r.person === ME.name && r.status !== 'Rejected' && r.worked.getTime() === date.getTime());

/** Divya's September 2026 (Chennai office: Sundays + 2nd / 4th Saturdays off; 14 Sep Vinayaka Chaturthi). */
const SEP_CODES: Record<number, DayCode> = {
  1: 'P', 2: 'P', 3: 'L', 4: 'P', 5: 'P', 6: 'WO', 7: 'P', 8: 'WFH', 9: 'P', 10: 'MP', 11: 'P', 12: 'WO', 13: 'WO', 14: 'H',
  15: 'P', 16: 'CL', 17: 'CL', 18: 'P', 19: 'P', 20: 'WO', 21: 'OD', 22: 'R', 23: 'L', 24: 'HD', 25: 'P', 26: 'WO', 27: 'WO', 28: 'P',
  29: 'TODAY', 30: 'FUT',
};
export const SEPTEMBER: AttendanceDay[] = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  const code = SEP_CODES[day];
  const base: AttendanceDay = { date: d(day), code };
  if (code === 'L') return { ...base, lateMin: day === 3 ? 22 : 35, workedMin: 500, note: day === 3 ? 'In 9:52 am' : 'In 10:05 am' };
  // 25 Sep matches its punches (9:25 am – 7:30 pm, 30 min break: 9 h 35 min worked, 1 h overtime in 15-min units).
  if (code === 'P') return { ...base, workedMin: day === 25 ? 575 : 520 + (day % 4) * 10, outAt: day === 25 ? '19:30' : undefined, otMin: day === 25 ? 60 : day === 11 ? 45 : 0, otStatus: day === 25 || day === 11 ? 'approved' : undefined };
  // The code already says the check-out is missing (DayCardBody titles it "Missing check-out · checked in 9:31 am").
  if (code === 'MP') return { ...base, note: 'Checked in 9:31 am' };
  if (code === 'R') return { ...base, note: 'Request sent 23 Sep: out was recorded outside the office' };
  if (code === 'HD') return { ...base, workedMin: 250, note: 'Casual leave, second half' };
  if (code === 'WFH') return { ...base, workedMin: 505 };
  // 8:55 am – 5:55 pm less the 30 min break (DAY_21_PUNCHES).
  if (code === 'OD') return { ...base, workedMin: 510, note: 'Hosur plant audit' };
  // Worked on the holiday: the comp-off credited for it expires 14 Oct (BALANCES CO).
  if (code === 'H') return { ...base, workedMin: 480, otMin: 480, otStatus: 'comp-off', note: 'Vinayaka Chaturthi · worked, comp-off credited' };
  // Worked on the 4th Saturday: claimable as comp-off until a claim for it exists (TIM-22).
  if (day === 26) return { ...base, workedMin: CLAIM_MIN, note: `Worked ${fmtDuration(CLAIM_MIN)} · ${claimSent(CLAIM.date) ? 'comp-off claim sent' : 'can be claimed as comp-off'}` };
  if (code === 'CL') return { ...base, note: 'Casual leave · approved' };
  return base;
});

/** August 2026 (locked period): mostly present. */
export const AUGUST: AttendanceDay[] = Array.from({ length: 31 }, (_, i) => {
  const date = new Date(2026, 7, i + 1);
  const dow = date.getDay();
  const nthSat = dow === 6 ? Math.ceil((i + 1) / 7) : 0;
  let code: DayCode = 'P';
  if (dow === 0 || nthSat === 2 || nthSat === 4) code = 'WO';
  if (i + 1 === 15) code = 'H';
  if (i + 1 === 12 || i + 1 === 13) code = 'SL';
  if (i + 1 === 27) code = 'EL';
  if (i + 1 === 19) code = 'L';
  if (i + 1 === 21) code = 'A';
  return { date, code, lateMin: code === 'L' ? 18 : undefined, workedMin: code === 'P' ? 525 : undefined, note: i + 1 === 15 ? 'Independence Day' : undefined };
});

/** Punches shown on a past day card (22 Sep, regularisation pending). */
export const DAY_22_PUNCHES: Punch[] = [
  { id: 'r1', kind: 'in', time: '09:34', source: 'mobile', where: 'Chennai office', distanceM: 0, verdict: 'inside', device: 'Pixel 7a (bound)' },
  { id: 'r2', kind: 'out', time: '14:02', source: 'mobile', where: 'Taramani Link Road', distanceM: 850, verdict: 'outside', device: 'Pixel 7a (bound)' },
];
export const DAY_10_PUNCHES: Punch[] = [{ id: 'm1', kind: 'in', time: '09:31', source: 'kiosk', where: 'Chennai office · Reception kiosk', distanceM: 0, verdict: 'inside', device: 'Kiosk KF-MAA-K1' }];
export const DAY_21_PUNCHES: Punch[] = [
  { id: 'o1', kind: 'in', time: '08:55', source: 'field', where: 'Hosur plant (on duty)', distanceM: 0, verdict: 'field', device: 'Pixel 7a (bound)' },
  { id: 'o2', kind: 'out', time: '17:55', source: 'field', where: 'Hosur plant (on duty)', distanceM: 20, verdict: 'field', offline: true, device: 'Pixel 7a (bound)' },
];

/* ---------- team (manager / HR views) ---------- */

export interface TeamPerson {
  id: string;
  name: string;
  code: string;
  role: string;
  dept: string;
  location: string;
  status: 'in' | 'late' | 'leave' | 'wfh' | 'not_in' | 'od' | 'off' | 'missing';
  inAt?: string;
  detail?: string;
  source?: Punch['source'];
  mode?: 'Punch' | 'Assumed present' | 'Timesheet';
  /** Field location tracking is off for the day, and why ("audit at supplier site"). */
  trackingOff?: string;
  /** Line manager: manager views show only the signed-in manager's own reports (`myReports`). */
  reportsTo: string;
}

export const TEAM: TeamPerson[] = [
  { id: 't1', name: 'Arun Prakash', code: 'KF-0112', role: 'QA Engineer', dept: 'Quality', location: 'Chennai office', status: 'in', inAt: '09:21', source: 'biometric', reportsTo: 'Divya Raghunathan' },
  { id: 't2', name: 'Meera Krishnan', code: 'KF-0124', role: 'QA Analyst', dept: 'Quality', location: 'Chennai office', status: 'late', inAt: '09:41', detail: 'Late by 11 min', source: 'mobile', reportsTo: 'Divya Raghunathan' },
  { id: 't3', name: 'Sanjay Rao', code: 'KF-0131', role: 'Lab Technician', dept: 'Quality', location: 'Hosur plant', status: 'leave', detail: 'Casual leave · 29–30 Sep', reportsTo: 'Divya Raghunathan' },
  { id: 't4', name: 'Fathima Beevi', code: 'KF-0140', role: 'QA Engineer', dept: 'Quality', location: 'Chennai office', status: 'wfh', inAt: '09:30', detail: 'WFH approved', source: 'web', reportsTo: 'Divya Raghunathan' },
  { id: 't5', name: 'Gopal Iyer', code: 'KF-0144', role: 'Lab Technician', dept: 'Quality', location: 'Hosur plant', status: 'not_in', detail: 'Shift started 9:00 am', reportsTo: 'Divya Raghunathan' },
  { id: 't6', name: 'Nisha Menon', code: 'KF-0152', role: 'Quality Auditor', dept: 'Quality', location: 'Chennai office', status: 'od', inAt: '09:05', detail: 'On duty · supplier audit, Guindy', source: 'field', mode: 'Assumed present', trackingOff: 'audit at supplier site', reportsTo: 'Divya Raghunathan' },
  { id: 't7', name: 'Rahul Deshpande', code: 'KF-0160', role: 'QA Engineer', dept: 'Quality', location: 'Chennai office', status: 'in', inAt: '09:26', source: 'web', reportsTo: 'Divya Raghunathan' },
  { id: 't8', name: 'Priya Shankar', code: 'KF-0163', role: 'QA Analyst', dept: 'Quality', location: 'Chennai office', status: 'missing', detail: 'Missing check-out yesterday', inAt: '09:29', source: 'kiosk', reportsTo: 'Divya Raghunathan' },
  { id: 't9', name: 'Arvind Natarajan', code: 'KF-0171', role: 'Sales Officer', dept: 'Sales', location: 'Chennai office', status: 'od', inAt: '09:12', detail: 'Field · 2 of 6 visits done', source: 'field', mode: 'Timesheet', reportsTo: 'Vikram Rao' },
  { id: 't10', name: 'Kavitha Sundaram', code: 'KF-0177', role: 'Line Operator', dept: 'Operations', location: 'Hosur plant', status: 'in', inAt: '06:02', source: 'kiosk', detail: 'Morning shift', reportsTo: 'Senthil Murugan' },
  { id: 't11', name: 'Rekha Balan', code: 'KF-0182', role: 'Line Operator', dept: 'Operations', location: 'Hosur plant', status: 'off', detail: 'Back on 1 Oct', reportsTo: 'Senthil Murugan' },
  { id: 't12', name: 'Anil Kumar', code: 'KF-0190', role: 'Maintenance Technician', dept: 'Operations', location: 'Hosur plant', status: 'not_in', detail: 'Call-out 2:00 am · resting until 11:00 am', reportsTo: 'Ramesh Gowda' },
  // Sales field staff on beats today (TIM-32 field map reads the same people).
  { id: 't13', name: 'Suganya Ramesh', code: 'KF-0223', role: 'Sales Officer', dept: 'Sales', location: 'Chennai office', status: 'od', inAt: '08:30', detail: 'Field · Chennai west beat', source: 'field', mode: 'Timesheet', reportsTo: 'Vikram Rao' },
  { id: 't14', name: 'Bharath Reddy', code: 'KF-0227', role: 'Sales Officer', dept: 'Sales', location: 'Chennai office', status: 'not_in', detail: 'Shift started 9:00 am · Vellore beat', reportsTo: 'Vikram Rao' },
  { id: 't15', name: 'Pooja Iyengar', code: 'KF-0231', role: 'Sales Officer', dept: 'Sales', location: 'Chennai office', status: 'od', inAt: '08:45', detail: 'Field · Chennai north beat', source: 'field', mode: 'Timesheet', trackingOff: 'location sharing turned off at 9:05 am', reportsTo: 'Vikram Rao' },
];

/** Line managers of people who have no TEAM row (Senthil Murugan is the Hosur shift supervisor; Meera Iyer is on notice, see ON_NOTICE). */
const LINE_MANAGER: Record<string, string> = { 'Senthil Murugan': 'Ramesh Gowda', [MEERA.name]: MEERA.manager, [ME.name]: ME.manager };
/** Direct line manager of `name` (from TEAM, else LINE_MANAGER). */
export const managerOf = (name: string): string | undefined => TEAM.find((p) => p.name === name)?.reportsTo ?? LINE_MANAGER[name];

/** People serving notice: Meera Iyer (Lab Analyst) resigned 20 Aug, last working day 19 Oct (People data). */
export const ON_NOTICE: Record<string, { role: string; dept: string; email: string; lastDay: Date }> = {
  [MEERA.name]: { role: MEERA.role, dept: 'Quality', email: 'meera.i@kaverifoods.in', lastDay: MEERA.lwd },
};

/** Hosur plant 4-on / 2-off roster: where each Operations worker sits in the 6-day cycle (Rekha is off today). */
// Kavitha: off Sun 27 and Mon 28 Sep, rostered Tue 29 – Fri 2 Oct (casual leave Thu 1 Oct), off Sat 3 and Sun 4 (TIM-05 LAST_WEEK, TIM-08).
export const PLANT_OFFSET: Record<string, number> = { 'Rekha Balan': 0, 'Kavitha Sundaram': 2, 'Anil Kumar': 2 };
/** True on a person's weekly off: the plant roster for Operations at Hosur, else Sundays plus 2nd and 4th Saturdays. */
export function personOff(name: string, date: Date) {
  const p = TEAM.find((t) => t.name === name);
  if (p?.dept === 'Operations' && p.location === 'Hosur plant') {
    const n = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(2026, 8, 1).getTime()) / 864e5);
    return ((((n + (PLANT_OFFSET[name] ?? 0)) % 6) + 6) % 6) >= 4;
  }
  return date.getDay() === 0 || (date.getDay() === 6 && [2, 4].includes(Math.ceil(date.getDate() / 7)));
}
/** True when `person` (a name) reports to `manager`, directly or through a supervisor (Kavitha → Senthil → Ramesh). */
export const isMyReport = (person: string, manager: string = ME.name) => {
  for (let m = managerOf(person), hops = 0; m && hops < 5; m = managerOf(m), hops++) if (m === manager) return true;
  return false;
};
/** People who report to `manager` (default: the signed-in manager, ME). */
export const myReports = (manager: string = ME.name) => TEAM.filter((p) => isMyReport(p.name, manager));
/** HR and payroll see everyone; anyone else sees only their own reports. */
export const seesEveryone = (user?: TimeUser) => !!user && (user.name === HR_ADMIN.name || user.name === PAYROLL_ADMIN.name);
/** admin = HR, payroll or a System Admin; manager = has reports; anyone else is an employee. */
export const timeScope = (user: TimeUser): NonNullable<TimeUser['scope']> =>
  user.scope ?? (seesEveryone(user) || user.role === 'System Admin' ? 'admin' : myReports(user.name).length ? 'manager' : 'employee');

/** Arvind Natarajan's field day today (on duty 9:12–9:42 am): the one record TIM-32 and TIM-33 read. */
export const FIELD_DAY = { person: 'Arvind Natarajan', planned: 6, done: 2, km: 4.8 };

export const STATUS_LABEL: Record<TeamPerson['status'], string> = {
  in: 'In',
  late: 'Late',
  leave: 'On leave',
  wfh: 'WFH',
  not_in: 'Not checked in',
  od: 'On duty',
  off: 'Weekly off',
  missing: 'Exception',
};

/* ---------- exceptions (P08 Q4) ---------- */

export interface ExceptionRow {
  id: string;
  person: string;
  code: string;
  date: Date;
  kind: 'Missing check-out' | 'Check-out outside office' | 'Missing check-in' | 'No attendance' | 'Refused check-in attempt' | 'Offline punch too old' | 'No approved timesheet';
  detail: string;
  mode: 'Punch' | 'Timesheet';
  nudged: number;
  status: 'Open' | 'Request pending' | 'Resolved';
  blocking: boolean;
  /** For 'Request pending' rows: what the employee asked for, and why. */
  requested?: string;
  reason?: string;
}

export const EXCEPTIONS: ExceptionRow[] = [
  { id: 'x1', person: 'Priya Shankar', code: 'KF-0163', date: new Date(2026, 8, 28), kind: 'Missing check-out', detail: 'In 9:29 am (kiosk), no out', mode: 'Punch', nudged: 1, status: 'Open', blocking: true },
  { id: 'x2', person: 'Divya Raghunathan', code: 'KF-0001', date: new Date(2026, 8, 10), kind: 'Missing check-out', detail: 'In 9:31 am (kiosk), no out', mode: 'Punch', nudged: 3, status: 'Open', blocking: true },
  { id: 'x3', person: 'Gopal Iyer', code: 'KF-0144', date: new Date(2026, 8, 25), kind: 'No attendance', detail: 'Working day, no punches, no leave', mode: 'Punch', nudged: 2, status: 'Open', blocking: true },
  { id: 'x4', person: 'Meera Krishnan', code: 'KF-0124', date: new Date(2026, 8, 24), kind: 'Refused check-in attempt', detail: 'Outside Chennai office, 850 m away · 9:27 am', mode: 'Punch', nudged: 0, status: 'Open', blocking: true },
  { id: 'x5', person: 'Divya Raghunathan', code: 'KF-0001', date: new Date(2026, 8, 22), kind: 'Check-out outside office', detail: 'Out 2:02 pm, 850 m from Chennai office', mode: 'Punch', nudged: 1, status: 'Request pending', blocking: true, requested: 'Check-out 6:35 pm at Chennai office', reason: 'Phone recorded the check-out on the way to a supplier visit' },
  { id: 'x6', person: 'Harish Gowda', code: 'KF-0205', date: new Date(2026, 8, 18), kind: 'No approved timesheet', detail: 'Week of 14 Sep not submitted', mode: 'Timesheet', nudged: 2, status: 'Open', blocking: false },
  { id: 'x7', person: 'Kavitha Sundaram', code: 'KF-0177', date: new Date(2026, 8, 19), kind: 'Offline punch too old', detail: 'Saved offline 52 hours ago; only 48 hours allowed', mode: 'Punch', nudged: 0, status: 'Open', blocking: true },
  { id: 'x8', person: 'Rahul Deshpande', code: 'KF-0160', date: new Date(2026, 8, 15), kind: 'Missing check-in', detail: 'Out 6:35 pm only', mode: 'Punch', nudged: 1, status: 'Resolved', blocking: false },
];

/* ---------- OT review ---------- */

export interface OtRow {
  id: string;
  person: string;
  date: Date;
  shift: string;
  out: string;
  otMin: number;
  category: 'Normal' | 'Weekly off' | 'Holiday';
  weekHours: number;
  quarterHours: number;
  preApproved: boolean;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Comp-off';
}
export const OT_ROWS: OtRow[] = [
  { id: 'o1', person: 'Kavitha Sundaram', date: new Date(2026, 8, 26), shift: 'Morning 6:00 am – 2:00 pm', out: '16:20', otMin: 135, category: 'Normal', weekHours: 9.5, quarterHours: 58, preApproved: true, status: 'Pending' },
  { id: 'o2', person: 'Rekha Balan', date: new Date(2026, 8, 25), shift: 'Morning 6:00 am – 2:00 pm', out: '17:10', otMin: 180, category: 'Normal', weekHours: 13, quarterHours: 71, preApproved: false, status: 'Pending' },
  { id: 'o3', person: 'Anil Kumar', date: new Date(2026, 8, 24), shift: 'General 9:30 am – 6:30 pm', out: '21:45', otMin: 195, category: 'Normal', weekHours: 11, quarterHours: 77, preApproved: false, status: 'Pending' },
  { id: 'o4', person: 'Arun Prakash', date: new Date(2026, 8, 14), shift: 'General 9:30 am – 6:30 pm', out: '15:30', otMin: 360, category: 'Holiday', weekHours: 6, quarterHours: 18, preApproved: true, status: 'Pending' },
  { id: 'o5', person: 'Rahul Deshpande', date: new Date(2026, 8, 23), shift: 'General 9:30 am – 6:30 pm', out: '19:30', otMin: 60, category: 'Normal', weekHours: 3, quarterHours: 12, preApproved: false, status: 'Approved' },
  { id: 'o6', person: 'Meera Krishnan', date: new Date(2026, 8, 17), shift: 'General 9:30 am – 6:30 pm', out: '20:15', otMin: 105, category: 'Normal', weekHours: 4, quarterHours: 20, preApproved: false, status: 'Comp-off' },
  // Divya's own overtime: matches SEPTEMBER otMin / otStatus on 11 and 25 Sep.
  { id: 'o7', person: 'Divya Raghunathan', date: new Date(2026, 8, 11), shift: 'General 9:30 am – 6:30 pm', out: '19:15', otMin: 45, category: 'Normal', weekHours: 0.75, quarterHours: 6, preApproved: true, status: 'Approved' },
  { id: 'o8', person: 'Divya Raghunathan', date: new Date(2026, 8, 25), shift: 'General 9:30 am – 6:30 pm', out: '19:30', otMin: 60, category: 'Normal', weekHours: 1, quarterHours: 7, preApproved: true, status: 'Approved' },
];

/* ---------- leave ---------- */

export interface LeaveBalance {
  code: string;
  name: string;
  paid: boolean;
  balance: number;
  /** Unpaid types show "taken this year" instead (YX-LV-14). */
  taken: number;
  /** Credited this year, not counting `carried`. */
  credited: number;
  /** Carried forward from last year. Balance = credited + carried − taken. */
  carried?: number;
  pending: number;
  expiring?: string;
}
/** The whole year is credited on 1 Jan (TIM-30 ledger), so there is no monthly "next credit". */
export const BALANCES: LeaveBalance[] = [
  // Taken includes the approved 30 Oct day (lr6), as approved leave is deducted when approved (TIM-21 ledger).
  { code: 'CL', name: 'Casual leave', paid: true, balance: 3.5, taken: 4.5, credited: 8, pending: 0 },
  { code: 'SL', name: 'Sick leave', paid: true, balance: 6, taken: 2, credited: 8, pending: 0 },
  { code: 'EL', name: 'Earned leave', paid: true, balance: 14, taken: 5, credited: 15, carried: 4, pending: 2 },
  { code: 'CO', name: 'Comp-off', paid: true, balance: 1, taken: 0, credited: 1, pending: 0, expiring: '1 day expires 14 Oct' },
  { code: 'LWP', name: 'Leave without pay', paid: false, balance: 0, taken: 1, credited: 0, pending: 0 },
];

/** Other people's balances (read by person, never Divya's figures). */
export const PERSON_BALANCES: Record<string, LeaveBalance[]> = {
  'Priya Shankar': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 2.5, taken: 5.5, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 7, taken: 1, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 9, taken: 8, credited: 15, carried: 2, pending: 0 },
  ],
  'Kavitha Sundaram': [
    // Plant workers · Factories Act policy: CL 7, SL 7, EL earned 1 day per 20 days worked (9 by 29 Sep).
    // Taken includes the approved 1 Oct day; the 6–7 Oct request is pending (the kiosk lists it, so it reads only `balance`).
    { code: 'CL', name: 'Casual leave', paid: true, balance: 2, taken: 5, credited: 7, pending: 2 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 4, taken: 3, credited: 7, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 5, taken: 6, credited: 9, carried: 2, pending: 0 },
  ],
  // Divya's other reports. Each balance = credited + carried − taken.
  'Arun Prakash': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 2, taken: 6, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 8, taken: 0, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 18, taken: 2, credited: 15, carried: 5, pending: 4 },
    { code: 'CO', name: 'Comp-off', paid: true, balance: 0, taken: 0, credited: 0, pending: 0 },
    { code: 'LWP', name: 'Leave without pay', paid: false, balance: 0, taken: 0, credited: 0, pending: 0 },
  ],
  // Earned leave ran out on 1–3 Sep (−1.5); unpaid 7–8 Sep and 1 day before; comp-off 0.5 for her 17 Sep overtime.
  'Meera Krishnan': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 0, taken: 8, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 3, taken: 5, credited: 8, pending: 2 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: -1.5, taken: 16.5, credited: 15, pending: 0 },
    { code: 'CO', name: 'Comp-off', paid: true, balance: 0.5, taken: 0, credited: 0.5, pending: 0 },
    { code: 'LWP', name: 'Leave without pay', paid: false, balance: 0, taken: 3, credited: 0, pending: 0 },
  ],
  'Sanjay Rao': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 4, taken: 4, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 7, taken: 1, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 12, taken: 6, credited: 15, carried: 3, pending: 0 },
  ],
  'Fathima Beevi': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 5, taken: 3, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 6, taken: 2, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 12, taken: 7, credited: 15, carried: 4, pending: 0 },
  ],
  'Gopal Iyer': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 3, taken: 5, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 4, taken: 4, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 6, taken: 9, credited: 15, pending: 0 },
    { code: 'LWP', name: 'Leave without pay', paid: false, balance: 0, taken: 1, credited: 0, pending: 0 },
  ],
  'Nisha Menon': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 6, taken: 2, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 8, taken: 0, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 16, taken: 5, credited: 15, carried: 6, pending: 0 },
  ],
  'Rahul Deshpande': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 6, taken: 2, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 5, taken: 3, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 22.5, taken: 4, credited: 15, carried: 11.5, pending: 0 },
    { code: 'CO', name: 'Comp-off', paid: true, balance: 2, taken: 1, credited: 3, pending: 0 },
    { code: 'LWP', name: 'Leave without pay', paid: false, balance: 0, taken: 0, credited: 0, pending: 0 },
  ],
  // On maternity leave 3 Aug 2026 – 31 Jan 2027 (TIM-25); staff policy since 1 Jun, still earning leave while away.
  'Anitha Rajan': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 5, taken: 3, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 6, taken: 2, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 13, taken: 4, credited: 15, carried: 2, pending: 0 },
  ],
  // On sabbatical 1 Jul – 31 Dec 2026 (TIM-25): credited covers Jan–Jun only, no leave earned while away.
  'Ramesh Natarajan': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 4, taken: 2, credited: 6, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 6, taken: 0, credited: 6, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 9, taken: 0, credited: 9, pending: 0 },
  ],
  // Long leave without pay from 15 Sep (TIM-25): 12 working days to 29 Sep (Sundays and 2nd / 4th Saturdays off).
  'Sneha Pillai': [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 5, taken: 3, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 7, taken: 1, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 11, taken: 6, credited: 15, carried: 2, pending: 0 },
    { code: 'LWP', name: 'Leave without pay', paid: false, balance: 0, taken: 12, credited: 0, pending: 0 },
  ],
  // On notice (ON_NOTICE): TIM-18 notice story.
  [MEERA.name]: [
    { code: 'CL', name: 'Casual leave', paid: true, balance: 2, taken: 6, credited: 8, pending: 0 },
    { code: 'SL', name: 'Sick leave', paid: true, balance: 6, taken: 2, credited: 8, pending: 0 },
    { code: 'EL', name: 'Earned leave', paid: true, balance: 12, taken: 9, credited: 15, carried: 6, pending: 0 },
  ],
};
/**
 * Earned leave paid out at most per calendar year, in total (TIM-24 during the year + TIM-29 at year end): the year-end
 * limit is EL_ENCASH_MAX minus the days already encashed that year (`elEncashLeftAtYearEnd`).
 */
export const EL_ENCASH_MAX = 7;
/** Earned leave that must remain after encashing (TIM-24 blocks below it; TIM-27 policy shows it). */
export const EL_ENCASH_MIN_LEFT = 7;
/** Year-end payout limit once `encashedThisYear` days were already paid out during the year. */
export const elEncashLeftAtYearEnd = (encashedThisYear: number) => Math.max(0, EL_ENCASH_MAX - encashedThisYear);

/** Balances for a person: Divya's are BALANCES. */
export const balancesFor = (person: string): LeaveBalance[] => (person === ME.name ? BALANCES : PERSON_BALANCES[person] ?? []);
/** People with a paid balance below zero: the one list TIM-17 (Needs HR) and TIM-30 (Negative balances) read. */
export const NEGATIVE_BALANCES: string[] = [ME.name, ...Object.keys(PERSON_BALANCES)].filter((n) => balancesFor(n).some((b) => b.paid && b.balance < 0));

export interface LeaveRequestRow {
  id: string;
  person: string;
  type: string;
  from: Date;
  to: Date;
  days: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn' | 'Cancel requested';
  applied: Date;
  reason: string;
  cert?: 'verified' | 'pending';
  /** Who approves: Divya's own requests go to ME.manager; her reports' come to her. */
  approver: string;
  /** When it was approved or rejected. */
  decided?: Date;
}
export const LEAVE_REQUESTS: LeaveRequestRow[] = [
  { id: 'lr1', person: 'Divya Raghunathan', type: 'Earned leave', from: new Date(2026, 9, 12), to: new Date(2026, 9, 13), days: 2, status: 'Pending', applied: new Date(2026, 8, 27), reason: 'Family function in Madurai', approver: ME.manager },
  { id: 'lr2', person: 'Divya Raghunathan', type: 'Casual leave', from: new Date(2026, 8, 16), to: new Date(2026, 8, 17), days: 2, status: 'Approved', applied: new Date(2026, 8, 9), reason: 'Personal work', approver: ME.manager, decided: new Date(2026, 8, 10, 11, 5) },
  { id: 'lr3', person: 'Meera Krishnan', type: 'Sick leave', from: new Date(2026, 9, 1), to: new Date(2026, 9, 3), days: 2, status: 'Pending', applied: new Date(2026, 8, 28), reason: 'Viral fever', cert: 'pending', approver: ME.name },
  { id: 'lr4', person: 'Arun Prakash', type: 'Earned leave', from: new Date(2026, 9, 19), to: new Date(2026, 9, 23), days: 4, status: 'Pending', applied: new Date(2026, 8, 25), reason: 'Ayudha Puja travel', approver: ME.name },
  { id: 'lr5', person: 'Sanjay Rao', type: 'Casual leave', from: new Date(2026, 8, 29), to: new Date(2026, 8, 30), days: 2, status: 'Approved', applied: new Date(2026, 8, 22), reason: 'Personal', approver: ME.name, decided: new Date(2026, 8, 22, 16, 20) },
  // Future approved leave (TIM-19 "Ask to cancel"); Fri 30 Oct, clear of the TIM-18 default range 23–26 Oct.
  { id: 'lr6', person: 'Divya Raghunathan', type: 'Casual leave', from: new Date(2026, 9, 30), to: new Date(2026, 9, 30), days: 1, status: 'Approved', applied: new Date(2026, 8, 21), reason: 'Personal work', approver: ME.manager, decided: new Date(2026, 8, 22, 10, 30) },
];

/** Calendar rows for everyone; managers filter with `reportsTo === ME.name` (or use myReports). */
export const TEAM_MEMBERS = TEAM.map((p) => ({ id: p.id, name: p.name, team: p.dept, reportsTo: p.reportsTo }));
export const TEAM_ABSENCES = [
  { memberId: 't3', start: new Date(2026, 8, 29), end: new Date(2026, 8, 30), code: 'CL' },
  { memberId: 't2', start: new Date(2026, 9, 1), end: new Date(2026, 9, 3), code: 'SL' },
  { memberId: 't1', start: new Date(2026, 9, 19), end: new Date(2026, 9, 23), code: 'EL' },
  { memberId: 't4', start: new Date(2026, 9, 5), end: new Date(2026, 9, 5), code: 'CL' },
  { memberId: 't7', start: new Date(2026, 9, 7), end: new Date(2026, 9, 9), code: 'EL' },
  // Outside Divya's team, so HR's "Away this week" differs from the manager's: Kavitha's approved 1 Oct (TIM-05, TIM-08).
  { memberId: 't10', start: new Date(2026, 9, 1), end: new Date(2026, 9, 1), code: 'CL' },
];

export const HOLIDAYS = [
  { date: new Date(2026, 8, 14), name: 'Vinayaka Chaturthi' },
  { date: new Date(2026, 9, 2), name: 'Gandhi Jayanti' },
  { date: new Date(2026, 9, 20), name: 'Ayudha Puja' },
  { date: new Date(2026, 10, 8), name: 'Deepavali' },
  { date: new Date(2026, 11, 25), name: 'Christmas' },
];

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** Team-mates of `person` (same direct manager) off between `from` and `to`: the rule TIM-19 uses for its overlap fact. */
export function teamOffDuring(person: string, from: Date, to: Date): string[] {
  const lead = person === ME.name ? ME.name : managerOf(person);
  const scope = TEAM.filter((p) => p.reportsTo === lead && p.name !== person).map((p) => p.id);
  return TEAM_ABSENCES.filter((a) => scope.includes(a.memberId) && dayStart(a.start) <= dayStart(to) && dayStart(a.end) >= dayStart(from))
    .map((a) => TEAM.find((p) => p.id === a.memberId)!.name);
}
/** "1 & 3 Oct": `person`'s working days from `from` to `to` (their weekly offs and holidays left out), as the leave lists show them. */
export function workingDaysText(person: string, from: Date, to: Date): string {
  const days: Date[] = [];
  for (let d = new Date(dayStart(from)); d.getTime() <= dayStart(to); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
    if (!personOff(person, d) && !HOLIDAYS.some((h) => dayStart(h.date) === d.getTime())) days.push(d);
  const runs: [Date, Date][] = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && d.getTime() - dayStart(last[1]) <= 864e5 * 1.5) last[1] = d;
    else runs.push([d, d]);
  }
  const mon = (d: Date) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const run = ([a, b]: [Date, Date]) => (a === b ? `${a.getDate()}` : `${a.getDate()}–${b.getDate()}`);
  const oneMonth = days.every((d) => d.getMonth() === from.getMonth());
  return oneMonth ? `${runs.map(run).join(runs.length === 2 ? ' & ' : ', ')} ${mon(from)}` : runs.map((r) => `${run(r)} ${mon(r[0])}`).join(', ');
}

/**
 * Nav counts from the data (S12): Exceptions = unresolved blocking exceptions, Requests = pending leave, attendance and
 * overtime requests. HR / payroll see everyone; a manager sees only their own reports (never their own rows), and
 * only overtime within the legal limits (rows over them sit with HR). The desktop nav and the phone tab bar both use this.
 */
export function timeCounts(user?: TimeUser): { Exceptions: number; Requests: number } {
  const all = seesEveryone(user);
  const mine = (person: string) => all || isMyReport(person, user?.name ?? ME.name);
  return {
    // Every unresolved blocking exception (open or with a request waiting), as TIM-04 counts them.
    Exceptions: EXCEPTIONS.filter((x) => x.status !== 'Resolved' && x.blocking && mine(x.person)).length,
    Requests:
      LEAVE_REQUESTS.filter((r) => r.status === 'Pending' && mine(r.person)).length +
      COMP_OFF_REQUESTS.filter((r) => r.status === 'Pending' && mine(r.person)).length +
      EXCEPTIONS.filter((x) => x.status === 'Request pending' && mine(x.person)).length +
      OT_ROWS.filter((r) => r.status === 'Pending' && mine(r.person) && (all || !otCapFlag(r.weekHours, r.quarterHours))).length,
  };
}
