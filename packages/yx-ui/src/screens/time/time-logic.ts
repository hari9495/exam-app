// Pure rules for the Time screens (M02, M04, P08). No React, so tests and the server can share them.

/* ---------- clock helpers ---------- */

/** "09:30" → 570 */
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** 570 → "09:30" */
export const toHHMM = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** 470 → "7 h 50 min"; 120 → "2 h"; 45 → "45 min" (as in "Late by 22 min"). */
export const fmtDuration = (min: number) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  if (!h) return `${m} min`;
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
};

/* ---------- web / mobile clock-in policy ---------- */

export type ClockState = 'not_in' | 'working' | 'break' | 'out';
export type ClockAction = 'clock_in' | 'clock_out' | 'start_break' | 'end_break';
export type BlockCode = 'outside' | 'not_started' | 'already_out' | 'device' | 'coarse';

export interface ClockContext {
  state: ClockState;
  /** Minutes since midnight, e.g. 9:42 am = 582. */
  now: number;
  shift: { name: string; start: string; end: string; graceMin: number; /** Clock-in opens this many minutes before start. */ opensBeforeMin: number };
  /** Web: on an allowed office network (IP / Wi-Fi). Mobile: inside a geofence. */
  inside: boolean;
  locationName: string;
  distanceM?: number;
  accuracyM?: number;
  /** restricted = must be inside; field = location recorded, not restricted (M02 Q6). */
  mode: 'restricted' | 'field';
  deviceApproved: boolean;
  /** When already clocked out, the time, "18:41". */
  outAt?: string;
}

export interface ClockBlock {
  code: BlockCode;
  title: string;
  message: string;
  /** Alternatives the person can take instead (WFH / on duty / regularise). */
  options: ('wfh' | 'on_duty' | 'regularise' | 'retry' | 'ask_hr')[];
}

export function fmt12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Which buttons are live and, if clocking in or out is refused, the plain reason (M02 §B1, YX-AT-23, YX-MOB-05/08/18). */
export function evaluateClock(c: ClockContext): { actions: ClockAction[]; block: ClockBlock | null } {
  if (c.state === 'out')
    return {
      actions: [],
      block: {
        code: 'already_out',
        title: 'You have already clocked out today',
        message: `You clocked out at ${fmt12(c.outAt ?? c.shift.end)}. To change today's times, regularise the day.`,
        options: ['regularise'],
      },
    };
  if (!c.deviceApproved)
    return {
      actions: [],
      block: {
        code: 'device',
        title: 'This device is not approved for clock-in',
        message: 'Use your approved device, or ask HR to approve this one.',
        options: ['ask_hr'],
      },
    };
  if (c.state === 'not_in') {
    const opens = toMin(c.shift.start) - c.shift.opensBeforeMin;
    if (c.now < opens)
      return {
        actions: [],
        block: {
          code: 'not_started',
          title: 'Your shift has not started yet',
          message: `${c.shift.name} shift starts at ${fmt12(c.shift.start)}. Clock-in opens at ${fmt12(toHHMM(opens))}.`,
          options: [],
        },
      };
  }
  if (c.accuracyM !== undefined && c.accuracyM > 150 && c.mode === 'restricted')
    return {
      actions: c.state === 'not_in' ? [] : c.state === 'break' ? ['end_break'] : ['start_break'],
      block: {
        code: 'coarse',
        title: 'Location is not accurate enough',
        message: `Location accuracy ${c.accuracyM} m. Move outdoors or near a window, then retry location.`,
        options: ['retry', 'ask_hr'],
      },
    };
  if (!c.inside && c.mode === 'restricted') {
    const where = c.distanceM !== undefined ? `, ${formatDistance(c.distanceM)} away` : '';
    const clockVerb = c.state === 'not_in' ? 'Clock in' : 'Clock out';
    return {
      actions: c.state === 'working' ? ['start_break'] : c.state === 'break' ? ['end_break'] : [],
      block: {
        code: 'outside',
        title: `You're outside ${c.locationName}${where}`,
        message: `${clockVerb} as work from home or on duty instead?`,
        options: ['wfh', 'on_duty', 'retry'],
      },
    };
  }
  const actions: ClockAction[] =
    c.state === 'not_in' ? ['clock_in'] : c.state === 'working' ? ['clock_out', 'start_break'] : ['end_break'];
  return { actions, block: null };
}

/** Next state after an action (the card's state machine). */
export function nextClockState(s: ClockState, a: ClockAction): ClockState {
  if (a === 'clock_in' && s === 'not_in') return 'working';
  if (a === 'start_break' && s === 'working') return 'break';
  if (a === 'end_break' && s === 'break') return 'working';
  if (a === 'clock_out' && (s === 'working' || s === 'break')) return 'out';
  return s;
}

/* ---------- worked time, late / early, OT ---------- */

export type PunchSource = 'web' | 'mobile' | 'biometric' | 'kiosk' | 'teams' | 'desktop' | 'field';
export interface Punch {
  id: string;
  kind: 'in' | 'out' | 'break_start' | 'break_end';
  time: string; // "HH:mm"
  source: PunchSource;
  where: string; // "Chennai office" / "IP 10.20.4.17"
  distanceM?: number;
  verdict: 'inside' | 'outside' | 'field' | 'network';
  offline?: boolean;
  device?: string;
}

/** Worked minutes from paired in/out punches minus breaks; an open "in" counts to `now`. */
export function workedMinutes(punches: Punch[], now?: number): number {
  const sorted = [...punches].sort((a, b) => toMin(a.time) - toMin(b.time));
  let total = 0;
  let openAt: number | null = null;
  for (const p of sorted) {
    const t = toMin(p.time);
    if ((p.kind === 'in' || p.kind === 'break_end') && openAt === null) openAt = t;
    else if ((p.kind === 'out' || p.kind === 'break_start') && openAt !== null) {
      total += t - openAt;
      openAt = null;
    }
  }
  if (openAt !== null && now !== undefined && now > openAt) total += now - openAt;
  return total;
}

/**
 * A finished day's worked time from its punches (TIM-03): null when there is no check-out (hours not known).
 * Punched breaks are taken as recorded; with no punched break, the policy break (30 min above 5 h) is deducted.
 */
export function dayWorked(punches: Punch[], rule = { aboveMin: 300, breakMin: 30 }): { worked: number; breakMin: number; punchedBreak: boolean } | null {
  if (!punches.some((p) => p.kind === 'out')) return null;
  const gross = workedMinutes(punches);
  const starts = punches.filter((p) => p.kind === 'break_start');
  if (starts.length) {
    const ins = punches.filter((p) => p.kind === 'in').map((p) => toMin(p.time));
    const outs = punches.filter((p) => p.kind === 'out').map((p) => toMin(p.time));
    return { worked: gross, breakMin: Math.max(...outs) - Math.min(...ins) - gross, punchedBreak: true };
  }
  const breakMin = gross > rule.aboveMin ? rule.breakMin : 0;
  return { worked: gross - breakMin, breakMin, punchedBreak: false };
}

/** Minutes late beyond grace (0 when within grace). */
export const lateMinutes = (shiftStart: string, firstIn: string, graceMin: number) => {
  const d = toMin(firstIn) - toMin(shiftStart);
  return d > graceMin ? d : 0;
};
/** Minutes left early beyond grace. */
export const earlyMinutes = (shiftEnd: string, lastOut: string, graceMin: number) => {
  const d = toMin(shiftEnd) - toMin(lastOut);
  return d > graceMin ? d : 0;
};

/** OT after the policy minimum, rounded down to the unit (M02 Q7, YX-AT-04): 18:07 on a 18:00 end → 0. */
export function overtimeMinutes(shiftEnd: string, lastOut: string, minMin = 30, unitMin = 15): number {
  const extra = toMin(lastOut) - toMin(shiftEnd);
  if (extra < minMin) return 0;
  return Math.floor(extra / unitMin) * unitMin;
}

/** Factories Act style caps (P07): daily 10 h incl. OT? here: weekly OT and quarterly OT caps. */
export function otCapFlag(weekOtHours: number, quarterOtHours: number, caps = { week: 12, quarter: 75 }) {
  if (quarterOtHours > caps.quarter) return `Over the quarterly cap of ${caps.quarter} h (${quarterOtHours} h)`;
  if (weekOtHours > caps.week) return `Over the weekly cap of ${caps.week} h (${weekOtHours} h)`;
  return null;
}

/* ---------- geofence ---------- */

export function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Fence {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}
export type GeoVerdict = { kind: 'inside' | 'outside' | 'coarse'; fence: Fence; distanceM: number; message: string };

/** YX-AT-23: nearest allowed fence, verdict and the plain reason. */
export function geofenceVerdict(pin: { lat: number; lng: number; accuracyM: number }, fences: Fence[], maxAccuracyM = 150): GeoVerdict {
  const ranked = fences.map((f) => ({ f, d: distanceM(pin, f) - f.radiusM })).sort((a, b) => a.d - b.d);
  const { f, d } = ranked[0];
  const dist = Math.max(0, Math.round(d));
  if (pin.accuracyM > maxAccuracyM)
    return { kind: 'coarse', fence: f, distanceM: dist, message: `Location accuracy ${Math.round(pin.accuracyM)} m, move outdoors` };
  if (d <= 0) return { kind: 'inside', fence: f, distanceM: 0, message: `Inside ${f.name}` };
  return { kind: 'outside', fence: f, distanceM: dist, message: `Outside ${f.name}, ${formatDistance(dist)} away` };
}

/* ---------- attendance month ---------- */

export type DayCode = 'P' | 'A' | 'L' | 'HD' | 'CL' | 'EL' | 'SL' | 'H' | 'WO' | 'WFH' | 'OD' | 'R' | 'MP' | 'LOP' | 'FUT' | 'TODAY';

export const DAY_CODE_LABEL: Record<DayCode, string> = {
  P: 'Present',
  A: 'Absent',
  L: 'Late',
  HD: 'Half day',
  CL: 'Casual leave',
  EL: 'Earned leave',
  SL: 'Sick leave',
  H: 'Holiday',
  WO: 'Weekly off',
  WFH: 'Work from home',
  OD: 'On duty',
  R: 'Regularisation pending',
  MP: 'Missing check-out',
  LOP: 'Unpaid leave',
  FUT: 'Upcoming',
  TODAY: 'Today',
};

export interface AttendanceDay {
  date: Date;
  code: DayCode;
  /** Late minutes, early minutes and OT minutes as recorded by the day engine. */
  lateMin?: number;
  earlyMin?: number;
  otMin?: number;
  workedMin?: number;
  /** Recorded check-out ("19:25") when the day's punches must match `workedMin` exactly. */
  outAt?: string;
  /** Overtime approval; month totals count paid (approved) overtime only, not pending or taken as comp-off. */
  otStatus?: 'pending' | 'approved' | 'comp-off';
  note?: string;
}

/** Legend counts and totals for the month (M02 §B5 row totals). Payable days are the days before `today`. */
export function monthSummary(days: AttendanceDay[], today: Date = new Date(2026, 8, 29)) {
  const counts = {} as Record<DayCode, number>;
  for (const d of days) counts[d.code] = (counts[d.code] ?? 0) + 1;
  const c = (k: DayCode) => counts[k] ?? 0;
  // Today counts once checked in late, as the legend counts it under Late (so Present + Late + WFH adds up).
  const lateToday = days.filter((d) => d.code === 'TODAY' && (d.lateMin ?? 0) > 0).length;
  const present = c('P') + c('L') + c('WFH') + c('OD') + c('HD') * 0.5 + lateToday;
  const leave = c('CL') + c('EL') + c('SL') + c('HD') * 0.5;
  // An absence in an open month can still be fixed, so it is not unpaid yet; a locked month shows it as LOP.
  const lop = c('LOP');
  const absent = c('A');
  const lateMarks = days.filter((d) => (d.lateMin ?? 0) > 0).length;
  const otMin = days.reduce((a, d) => a + (d.otStatus === 'pending' || d.otStatus === 'comp-off' ? 0 : d.otMin ?? 0), 0);
  const compOffMin = days.reduce((a, d) => a + (d.otStatus === 'comp-off' ? d.otMin ?? 0 : 0), 0);
  const pending = c('R') + c('MP');
  /** Days the person must act on (missing punch, absent) vs regularisations already waiting for approval. */
  const toFix = days.filter((d) => d.code === 'MP' || d.code === 'A');
  const waiting = c('R');
  const payable = days.filter((d) => d.code !== 'FUT' && daysUntil(d.date, today) < 0).length - lop - absent;
  return { counts, present, leave, lop, absent, lateMarks, otMin, otHours: Math.round((otMin / 60) * 100) / 100, compOffMin, pending, toFix, waiting, payable };
}

/** Late marks in the month up to and including this day (the "2 of 3 free" count). */
export function lateMarkNumber(day: AttendanceDay, monthDays: AttendanceDay[]) {
  return monthDays.filter((d) => d.date.getMonth() === day.date.getMonth() && d.date.getFullYear() === day.date.getFullYear() && d.date <= day.date && (d.lateMin ?? 0) > 0).length;
}

/* ---------- relative dates (DueBadge) ---------- */

/** Whole calendar days from `today` to `date` (negative = past). */
export const daysUntil = (date: Date, today: Date) =>
  Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);

/** "today" / "tomorrow" / "in 6 days" / "yesterday" / "15 days ago", "in 4 months" beyond 60 days, plus the tone: red overdue, amber within 7 days, else neutral. */
export function relativeDue(date: Date, today: Date): { text: string; tone: 'danger' | 'warning' | 'neutral'; days: number } {
  const n = daysUntil(date, today);
  const months = Math.round(Math.abs(n) / 30.44);
  const span = Math.abs(n) > 60 ? `${months} months` : `${Math.abs(n)} days`;
  const text = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${span}` : `${span} ago`;
  return { text, tone: n < 0 ? 'danger' : n <= 7 ? 'warning' : 'neutral', days: n };
}

/* ---------- leave day counting ---------- */

export type Half = 'full' | 'first' | 'second';
export interface LeaveCountInput {
  from: Date;
  to: Date;
  /** Half on the first day ("second" = starts after lunch) and on the last day ("first" = back after lunch). */
  fromHalf?: Half;
  toHalf?: Half;
  holidays: Date[];
  /** 0 = Sunday … 6 = Saturday; plus extra dated weekly offs (alternate Saturdays). */
  weeklyOffDays: number[];
  weeklyOffDates?: Date[];
  /** L3: none = skip holidays / offs; sandwich = count them only when between leave days; always = count all. */
  sandwich: 'none' | 'sandwich' | 'always';
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export interface LeaveDay {
  date: Date;
  kind: 'counted' | 'holiday' | 'weekly_off' | 'sandwich';
  value: number;
  label?: string;
}

/** YX-LV-03: per-day breakdown and total counted days. */
export function countLeaveDays(i: LeaveCountInput): { days: LeaveDay[]; total: number; sandwichDays: number; excluded: number } {
  const out: LeaveDay[] = [];
  for (let d = i.from; d <= i.to; d = addDays(d, 1)) {
    const hol = i.holidays.some((h) => sameDay(h, d));
    const off = i.weeklyOffDays.includes(d.getDay()) || (i.weeklyOffDates ?? []).some((w) => sameDay(w, d));
    if (hol || off) {
      const between = !sameDay(d, i.from) && !sameDay(d, i.to);
      const counts = i.sandwich === 'always' || (i.sandwich === 'sandwich' && between);
      out.push({ date: d, kind: counts ? 'sandwich' : hol ? 'holiday' : 'weekly_off', value: counts ? 1 : 0 });
      continue;
    }
    let v = 1;
    const single = sameDay(i.from, i.to);
    if (sameDay(d, i.from) && i.fromHalf && i.fromHalf !== 'full') v = 0.5;
    if (!single && sameDay(d, i.to) && i.toHalf && i.toHalf !== 'full') v = 0.5;
    out.push({ date: d, kind: 'counted', value: v });
  }
  // A sandwich only applies when leave days sit on both sides; trim offs at the edges (already excluded above).
  const total = out.reduce((a, x) => a + x.value, 0);
  return {
    days: out,
    total,
    sandwichDays: out.filter((x) => x.kind === 'sandwich').length,
    excluded: out.filter((x) => x.kind === 'holiday' || x.kind === 'weekly_off').length,
  };
}

/** Live summary warnings (YX-LV-05, YX-LV-12). */
export function leaveWarnings(o: {
  total: number;
  balance: number;
  negativeLimit: number;
  noticeDays: number;
  daysAhead: number;
  maxPerRequest: number;
  attachmentAfter: number | null;
  hasAttachment: boolean;
  blocked: boolean;
  onNotice: boolean;
  noticePolicy?: 'allowed' | 'lop' | 'extends' | 'blocked';
}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const after = o.balance - o.total;
  if (after < -o.negativeLimit) errors.push(`Not enough balance: you have ${o.balance} days and this needs ${o.total}. Choose fewer days or another leave type.`);
  else if (after < 0) warnings.push(`Your balance goes to ${after} days. Future credits repay it first.`);
  if (o.total > o.maxPerRequest) errors.push(`At most ${o.maxPerRequest} days in one request. Split it into two requests.`);
  // No notice rule (0 days) means nothing to warn about, also for a backdated start.
  if (o.noticeDays > 0 && o.daysAhead < o.noticeDays) warnings.push(`This type needs ${o.noticeDays} days' notice. Your manager may send it back.`);
  if (o.attachmentAfter !== null && o.total > o.attachmentAfter && !o.hasAttachment)
    errors.push(`Attach a medical certificate for more than ${o.attachmentAfter} days.`);
  if (o.blocked) errors.push('These dates include a company block date. Pick other dates.');
  if (o.onNotice) {
    if (o.noticePolicy === 'blocked') errors.push('This leave type cannot be taken during your notice period.');
    else if (o.noticePolicy === 'lop') warnings.push('You are serving notice: these days will be counted as loss of pay.');
    else if (o.noticePolicy === 'extends') warnings.push(`You are serving notice: your last working day moves by ${o.total} days.`);
  }
  return { errors, warnings, balanceAfter: after };
}

/* ---------- requests ---------- */

/** M02 Q5: up to `limit` regularisations a month with manager approval; beyond that HR is added. P08 Q4: locked dates add HR as a late request. */
export function regularisationRoute(o: { usedThisMonth: number; limit?: number; dateLocked: boolean }) {
  const limit = o.limit ?? 4;
  const steps = ['Manager'];
  const notes: string[] = [];
  if (o.usedThisMonth >= limit) {
    steps.push('HR');
    notes.push(`You have used ${o.usedThisMonth} of ${limit} regularisations this month, so HR approves too.`);
  }
  if (o.dateLocked) {
    if (!steps.includes('HR')) steps.push('HR');
    notes.push('This date is in a locked period: it goes as a late request and the effect lands in next month’s payroll.');
  }
  return { steps, notes, left: Math.max(0, limit - o.usedThisMonth) };
}

/* ---------- year end ---------- */

export interface YearEndRow {
  name: string;
  type: string;
  closing: number;
  cfCap: number;
  encashMax: number;
}
/** YX-LV-07: carry forward up to cap, encash up to the encash limit from what is left, lapse the rest. */
export function yearEndSplit(r: YearEndRow) {
  const carry = Math.min(r.closing, r.cfCap);
  const encash = Math.min(r.closing - carry, r.encashMax);
  const lapse = r.closing - carry - encash;
  return { carry, encash, lapse };
}

/** Encashment amount (L5): selected components ÷ divisor × days. */
export const encashAmount = (monthlyBase: number, divisor: 26 | 30, days: number) => Math.round((monthlyBase / divisor) * days);

/* ---------- periods ---------- */

export type PeriodStage = 'open' | 'frozen' | 'locked' | 'filed';
/** YX-LOCK-05: reopen is refused once anything left the system. */
export function canReopen(p: { stage: PeriodStage; bankReleased: boolean; payslipsPublished: boolean; returnFiled: boolean }) {
  if (p.stage === 'open' || p.stage === 'frozen') return { ok: false, reason: 'The period is not locked.' };
  if (p.returnFiled || p.stage === 'filed') return { ok: false, reason: 'A return is filed for this period. Make a correction in the next period instead.' };
  if (p.bankReleased) return { ok: false, reason: 'The bank file is released. Make a correction in the next payroll instead.' };
  if (p.payslipsPublished) return { ok: false, reason: 'Payslips are published. Make a correction in the next payroll instead.' };
  return { ok: true, reason: '' };
}
