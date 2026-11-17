// What the time and leave API returns (apps/api/src/time). The screens stay presentational; the API checks every call.

import type { LoadState as BaseLoadState } from '../../org/types';
/** Time pages add 'no-record': the signed-in person has no employee record (or no job today); retrying never helps. */
export type LoadState = BaseLoadState | 'no-record';
export type Half = 'full' | 'first' | 'second';

export interface LeaveBalanceRow {
  leaveTypeId: string;
  code: string;
  name: string;
  kind: string;
  colour: string;
  paid: boolean;
  hasBalance: boolean;
  balance: number;
  pending: number;
  available: number;
  takenThisYear: number;
  entitlement: number | null;
  negativeLimit: number;
  /** The balance on the first day of the leave year, where the record has one (the Home's "since 1 Apr"). */
  atYearStart?: number;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'cancel_pending' | 'cancelled' | 'sent_back' | 'resent';

export interface LeaveRequestRow {
  id: string;
  employeeId: string;
  type: { id: string; code: string; name: string; colour: string; medical: boolean } | null;
  from: string;
  to: string;
  fromHalf: 'full' | 'second';
  toHalf: 'full' | 'first';
  days: number;
  status: LeaveStatus;
  certificate: 'none' | 'pending' | 'verified';
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** Sent back for changes: what the approver asked to change, and who. */
  sentBack?: { reason: string | null; by: string | null; at: string } | null;
}

export interface HolidayRow {
  id: string;
  on: string;
  name: string;
  kind: 'national' | 'state' | 'festival' | 'optional' | 'restricted';
  halfDay: boolean;
  chosen?: boolean;
}

export interface MyLeave {
  employee: { id: string; name: string; code: string | null };
  today: string;
  year: { start: string; end: string };
  balances: LeaveBalanceRow[];
  requests: LeaveRequestRow[];
  /** optionalLimit: this year's limit (prorated after a move); yearlyLimit: the calendar's own. */
  holidays: { calendar: { id: string; name: string; optionalLimit: number; yearlyLimit?: number; movedOn?: string | null } | null; list: HolidayRow[] };
}

export interface LeaveInput {
  leaveTypeId: string;
  from: string;
  to: string;
  fromHalf: 'full' | 'second';
  toHalf: 'full' | 'first';
  reason?: string;
  delegateUserId?: string;
  certificate?: boolean;
  /** Batch A C4: up to 10 colleagues told on approval, with the dates only. */
  notifyUserIds?: string[];
  expectedOn?: string;
  maternityCase?: MaternityCase;
}
export type MaternityCase = 'birth' | 'third_child' | 'adoption' | 'miscarriage' | 'tubectomy';

export interface LeavePlan {
  type: { id: string; code: string; name: string; kind: string; rules: { certificateAfterDays: number | null; medical: boolean; halfDays: boolean } };
  days: { on: string; part: Half; portion: number; countedAs: 'leave' | 'sandwich' | 'holiday' | 'weekly_off' }[];
  total: number;
  holidaysExcluded: number;
  sandwichDays: number;
  balance: LeaveBalanceRow | null;
  balanceAfter: number | null;
  othersOff: number;
  certificateNeeded: boolean;
  blocks: string[];
  warnings: string[];
  blockDates?: { from: string; to: string; reason: string }[];
  notice?: { lastDay: string; newLastDay: string } | null;
  shortNotice?: boolean;
  /** HR applying for someone: the notice the type asks for was not needed (leave.notice.on_behalf). */
  noticeSkipped?: boolean;
  noticeDays?: number;
  /** HR applying for someone: the normal approvers decide ('chain'), or it is approved at once (company setting). */
  approval?: 'chain' | 'approved';
}

/** Founder answer B: what the Apply-for-someone dialog loads for the person picked (GET /time/hr/leave/:employeeId). */
export interface ApplyForForm {
  employee: { id: string; name: string; code: string | null };
  today: string;
  balances: LeaveBalanceRow[];
  approval: 'chain' | 'approved';
}

export type PunchKind = 'in' | 'out' | 'break_start' | 'break_end';

/** The browser's location sent with a punch. */
export interface Pin {
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface PunchRow {
  id: string;
  kind: PunchKind;
  at: string;
  source: string;
  accepted: boolean;
  refusal: string | null;
  verdict: string;
  distanceM: number | null;
  accuracyM: number | null;
  where: string | null;
  /** WithNote: the note kept with the punch (null without one). */
  note?: string | null;
}

export type DayStatus = 'present' | 'half_day' | 'absent' | 'leave' | 'holiday' | 'weekly_off' | 'missing_in' | 'missing_out' | 'no_timesheet' | 'not_started' | 'strike' | 'lockout' | 'layoff';

export interface DayRow {
  on: string;
  status: DayStatus;
  leavePart: Half | null;
  firstIn?: string | null;
  lastOut?: string | null;
  workedMinutes: number | null;
  lateMinutes: number | null;
  regularised: boolean;
  /** Overtime claimed for the day (pending or approved), on the muster. */
  otMinutes?: number;
  otStatus?: 'pending' | 'approved' | null;
}

export type FixKind = 'missed_in' | 'missed_out' | 'wrong_time' | 'full_day';

/** Extra · Attendance calendar, Manager · one person: GET /time/people/:id/attendance (their manager, or attendance.view in scope). */
export interface PersonAttendance {
  month: string;
  employee: { id: string; name: string; code: string | null; role: string | null; location: string | null };
  today: string;
  zone: string;
  days: DayRow[];
  /** Fixes still waiting for approval this month. */
  requests: { id: string; on: string; kind: FixKind | 'wfh'; status: 'pending' }[];
  /** Days of the month in a frozen or locked period. */
  locked: string[];
  shift: { pattern: string | null; weekOf: string; name: string | null; start: number | null; end: number | null };
}

export interface FixRow {
  id: string;
  on: string;
  /** A fix of the day, work from home on it, on duty, or an hourly permission (TIM-07). */
  kind: FixKind | 'wfh' | 'on_duty' | 'permission';
  inMinute: number | null;
  outMinute: number | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'sent_back' | 'resent';
  /** On duty: where. */
  place?: string | null;
  /** Sent back for changes: what the manager asked to change. */
  sentBack?: string | null;
}

/** TIM-07 Ot: overtime asked for ahead of the work. */
export interface OtPlanRow {
  id: string;
  on: string;
  minutes: number;
  takeAs: 'pay' | 'comp_off';
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
}
export interface OtPlanInput {
  on: string;
  minutes: number;
  takeAs: 'pay' | 'comp_off';
  reason: string;
}

/** TIM-07 OnDuty: a day or part of one on duty away from the office. */
export interface OnDutyInput {
  on: string;
  inMinute: number;
  outMinute: number;
  place: string;
  reason: string;
  /** Sending again a request sent back for changes. */
  resendOf?: string;
}

/** Batch A item 7 (B4): an hourly permission, a from and to time on one working day; it never uses leave. */
export interface PermissionInput {
  on: string;
  inMinute: number;
  outMinute: number;
  reason: string;
}

/** TIM-31 Multi: one check-in point of a location. */
export interface GeoPointInput { name: string; lat: number; lng: number; radiusM: number }

export interface MyAttendance {
  employee: { id: string; name: string };
  today: string;
  zone: string;
  mode: 'punch' | 'assumed_present' | 'timesheet';
  /** Today's shift from the roster, pattern or location (off: a weekly off today). */
  shift: { name: string; start: number; end: number; grace: number; checkIn: 'restricted' | 'field'; off?: boolean; /** Check-in opens this many minutes before the start (null: any time). */ opensBefore?: number | null };
  /** Is this computer on the office network: "outside" blocks clock-in before a punch; "unknown" leaves it to the punch. */
  network?: 'inside' | 'outside' | 'unknown';
  /** The manager who approves work from home. */
  manager?: string | null;
  /** The company lets people clock in as work from home on the day (ChoseWfh), and today's request still waiting. */
  wfhSameDay?: boolean;
  wfhPendingToday?: boolean;
  /** DeviceNotApproved: the company asks for an approved computer (required), this one is (approved), HR was asked (requested). */
  device?: { required: boolean; approved: boolean; requested: boolean };
  /** One per check-in point (TIM-31 Multi: `point` names it when the location has more than one). */
  fences: { name: string; point?: string; lat: number; lng: number; radiusM: number }[];
  punches: PunchRow[];
  next: 'in' | 'out';
  /** On a break now (Start break pressed, End break not yet). */
  onBreak?: boolean;
  days: DayRow[];
  requests: FixRow[];
  regularise: { limit: number; used: number };
  /** Work-from-home days this month (asked for or approved) and the days a month the manager alone approves. */
  wfh: { limit: number; used: number };
  /** TIM-07 OnDuty: how far ahead and back on duty can be asked (company settings). */
  onDuty?: { aheadDays: number; backDays: number };
  /** Batch A item 7 (B4): hourly permissions this month (asked for or approved), and the company's limits. */
  permission?: { limit: number; maxMinutes: number; used: number };
  /** TIM-07 Ot: overtime asked for ahead, and how far ahead it can be asked. */
  otPlans?: OtPlanRow[];
  otAheadDays?: number;
  /** Today is an approved work-from-home day. */
  wfhToday?: boolean;
  /** Days of the month in a frozen or locked period: a fix becomes a late correction (TIM-07), paid next payroll. */
  locked?: string[];
  /** How many days back a late correction may still be asked for (payroll.late_request_max_days). */
  lateRequestMaxDays?: number;
}
export interface LateCorrectionInput {
  on: string;
  kind: 'attendance' | 'leave';
  shouldBe: string;
  reason: string;
}

export interface WfhInput {
  on: string;
  reason: string;
}

export interface PunchResult {
  accepted: boolean;
  duplicate: boolean;
  kind: PunchKind;
  message: string;
  verdict: string;
  distanceM: number | null;
}

export interface FixInput {
  on: string;
  kind: FixKind;
  inMinute?: number;
  outMinute?: number;
  reason: string;
}

export interface TeamCalendar {
  from: string;
  to: string;
  scope: 'team' | 'granted' | 'company';
  people: { id: string; name: string; code: string | null; me: boolean; holidays: { on: string; name: string; halfDay: boolean }[]; days: { on: string; part: Half; status: 'pending' | 'approved'; code: string; colour: string; name: string }[] }[];
}

export interface Muster {
  month: string;
  from: string;
  to: string;
  scope: 'team' | 'granted' | 'company';
  people: {
    id: string;
    name: string;
    code: string | null;
    location: string;
    me: boolean;
    mode: string;
    missingPunchEffect: string;
    remindedOn?: string[];
    days: DayRow[];
    /** In the viewer's reporting line (founder 2 Nov 2026): what Pre-approve overtime needs; absent for everyone else. */
    ot?: { aheadDays: number; factoriesAct: boolean };
  }[];
  /** TIM-02: the month's stage for its legal entity (null when the company has several and none is picked). */
  period?: MusterPeriod | null;
  /** HR may mark people present in bulk (leave.approve; checked per person on the server). */
  canMarkPresent?: boolean;
}
export interface MusterPeriod {
  legalEntityId: string;
  entityName: string;
  stage: 'open' | 'frozen' | 'locked' | 'filed';
  lockableFrom: string;
  lockable: boolean;
  flow: 'one_step' | 'two_step';
  sentAt: string | null;
  lockedAt: string | null;
  exceptions: number;
  pending: { kind: string; count: number }[];
  canLock: boolean;
  canApprove: boolean;
}

export interface DayCard {
  person: { name: string; code: string | null };
  on: string;
  zone: string;
  /** The day's shift; null on a weekly off (older servers leave it out). */
  shift?: { name: string; start: number; end: number; grace: number } | null;
  day: Omit<DayRow, 'on'> | null;
  punches: (PunchRow & { minute: number })[];
  /** TIM-03: the day's overtime (as a claim fixes it) and any claim for it. */
  ot?: { eligibleMinutes: number; payableMinutes: number; overCapMinutes: number; category: OtCategory; settle: 'pay' | 'comp_off'; claim: { id: string; status: 'pending' | 'approved'; overridden: boolean } | null } | null;
  /** Late marks this month up to the day, and how many are free (attendance.late_marks_free). */
  lateMarks?: { month: number; free: number };
  locked?: boolean;
  /** TIM-03 HrFix: null when the viewer may not resolve; otherwise whether they may now, and why not. */
  hrFix?: { ok: boolean; why: string | null } | null;
  resolution?: { how: 'present' | 'absent'; inMinute: number | null; outMinute: number | null; reason: string; by: string | null; at: string } | null;
  /** TIM-03 OnDuty: an on-duty request for the day (approved, else waiting). */
  onDuty?: { id: string; place: string; inMinute: number; outMinute: number; reason: string; status: 'approved' | 'pending' } | null;
}
export interface ResolveInput {
  days: { employeeId: string; on: string }[];
  how: 'present' | 'absent';
  inMinute?: number;
  outMinute?: number;
  reason: string;
}

export interface HrBalances {
  types: { id: string; code: string; name: string; kind: string }[];
  people: { employeeId: string; name: string; code: string | null; canAdjust: boolean; balances: LeaveBalanceRow[] }[];
}

export interface LedgerRow {
  id: string;
  on: string;
  type: string;
  kind: string;
  days: number;
  reason: string;
}

export interface LeaveRules {
  sandwich: 'none' | 'sandwich' | 'always';
  sandwichOn: 'weekly_offs' | 'holidays' | 'both';
  sandwichHalfDays: boolean;
  halfDays: boolean;
  minDays: number | null;
  maxDays: number | null;
  /** Apply at least this many days ahead; null: the company default (sick leave 0). */
  noticeDays: number | null;
  /** Shorter notice is refused (block) or allowed and flagged to the approver (warn). */
  noticeMode?: 'block' | 'warn';
  certificateAfterDays: number | null;
  medical: boolean;
  negativeLimit: number;
  encashable: boolean;
  hrApprovalAboveDays: number | null;
  /** Pay by day ranges (G1); one step of 1-99 % over the whole year is "partially paid" (TIM-27 Basics). */
  paySteps?: { days: number; percent: number }[] | null;
  /** TIM-27 Rules: the most days in one calendar month (null: no limit). */
  maxDaysPerMonth?: number | null;
  /** TIM-27 Year end: cash-in limits and payout (null: the company's). */
  encashMaxDays?: number | null;
  encashMinLeft?: number | null;
  encashDivisor?: 26 | 30 | null;
  encashAtExit?: boolean;
  /** TIM-27 Absence & notice (null: the company's). */
  longAbsence?: 'pause' | 'continue' | null;
  noticePeriod?: 'allowed' | 'extends' | 'blocked' | null;
}

/** TIM-27 Statutory: what the law fixes for the type's kind. */
export interface StatutoryMinimum {
  law: string;
  days: number;
  paidInFull: boolean;
}

export interface LeaveTypeRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  paid: boolean;
  colour: string;
  active: boolean;
  rules: LeaveRules;
  /** Set by law (maternity; paternity where a state rule applies): those fields can't go below it. */
  statutory?: StatutoryMinimum | null;
}

export interface PolicyLine {
  leaveTypeId: string;
  annualDays: number;
  frequency: 'monthly' | 'yearly';
  proRata: boolean;
  rounding: number;
  carryForwardMax: number | null;
}

export interface LocationRule {
  validFrom: string | null;
  shiftName: string;
  shiftStart: number;
  shiftEnd: number;
  graceMinutes: number;
  weeklyOffs: { weekday: number; nth?: number[] }[];
  checkIn: 'restricted' | 'field';
  starter?: boolean;
}

export interface TimeSetup {
  today: string;
  /** HLP-12 answer 62: the injury leave type code (company setting) and whether the company has that type yet. */
  injuryLeave?: { code: string; missing: boolean };
  types: LeaveTypeRow[];
  policies: { id: string; name: string; archived: boolean; versions: { id: string; validFrom: string; lines: PolicyLine[]; note: string | null }[]; assignments: { id: string; scopeType: string; scopeId: string; scopeName: string; validFrom: string; removable: boolean }[] }[];
  calendars: {
    id: string;
    name: string;
    locationId: string | null;
    halfDayOpenHalf: 'first' | 'second';
    optionalLimit: number;
    /** TIM-26 rules: a holiday on a weekly off; optional holidays after a move to this office. */
    onWeeklyOff?: 'none' | 'substitute' | 'comp_off';
    onMove?: 'share' | 'reset';
    /** When a draft was last published (null: holidays added one by one). */
    publishedAt?: string | null;
    /** TIM-42 changes from the holiday feed waiting for review. */
    waitingFeedChanges?: number;
    holidays: HolidayRow[];
    /** Clone to next year or a state template, waiting to be published (never seen by employees). */
    drafts?: (HolidayRow & { confirm: boolean; source: 'clone' | 'template' })[];
    /** Batch A item 9 (D11): holidays or weekly offs marked as working days. */
    workingDays?: { id: string; on: string; reason: string }[];
  }[];
  /** TIM-26: location id → state name, for locations with a state template. */
  templates?: Record<string, string>;
  /** TIM-28: grades for "Apply to", people per policy today, people no policy covers, the policy order. */
  grades?: { id: string; name: string }[];
  coverage?: Record<string, { people: number; overrides: number }>;
  covered?: number;
  uncovered?: { count: number; people: { id: string; name: string; code: string | null; joinedOn: string }[] };
  order?: { current: string[] | null; currentFrom: string | null; upcoming: { validFrom: string; policyIds: string[] } | null };
  locations: { id: string; name: string; state: string; timezone: string; geofence: { lat: number; lng: number; radiusM: number } | null; /** TIM-31 Multi: every check-in point. */ points?: GeoPointInput[]; /** Sent back with a points change (409 when someone else changed it first). */ updatedAt?: string; ipRanges: string[]; /** Answers 131, 141: Settings › Locations › Registered factory. */ registeredFactory?: boolean; /** Answer 141: Factories Act coverage here and where it comes from. */ factoriesAct?: FactoriesActCover; rule: LocationRule; upcoming: LocationRule[] }[];
  entities: { id: string; name: string }[];
  /** Founder decision 2: days' notice for a leave type without its own number (company setting; sick leave 0). */
  noticeDefault?: number;
  /** TIM-27: the company values a type follows until it sets its own (setting key → value). */
  leaveDefaults?: Record<string, string>;
  /** The Maternity Benefit Act values in force (P07 IN.LEAVE). */
  maternity?: { maternityWeeks: number; maternityWeeksThirdChild: number; beforeDeliveryWeeks: number; eligibilityDaysWorked: number; miscarriageWeeks?: number; tubectomyWeeks?: number };
  /** statute: IN.SE (a state's minimums) or IN.FACTORIES.LEAVE (registered factories, HLP-14 answer 131). */
  statutory: { statute?: string; jurisdiction: string; version: string; validFrom: string; values: { floors?: { kinds: string[]; days: number }[]; carry?: Record<string, number> }; source: string; verify: boolean }[];
}

export interface YearEndPreview {
  yearEnd: string;
  lapses: number;
  rows: { employeeId: string; name: string; code: string | null; type: string; balance: number; carry: number; lapse: number; encashable: boolean; /** Paid out (over the carry cap, within the yearly cash-in limit). */ encash?: number }[];
  /** TIM-29: requests still waiting with days in the closing year. */
  pending?: { id: string; employeeId: string; name: string; type: string; from: string; to: string; days: number }[];
  payOuts?: number;
  /** Already posted for this date (a second post is refused). */
  posted?: { at: string; by: string | null; policies: number } | null;
}

/** TIM-29 Transition: changing a legal entity's leave year (a short year, then full years). */
export interface YearChangePreview {
  entity: { id: string; name: string };
  oldStartMonth: number;
  newStartMonth: number;
  /** First day of the short year and its last day. */
  fromOn: string;
  shortEnd: string;
  months: number;
  /** Why it can't be scheduled (plain words), or null. */
  problem: string | null;
  scheduled: { fromOn: string; oldStartMonth: number; newStartMonth: number; shortEnd: string } | null;
  rows: { employeeId: string; name: string; type: string; opening: number; credit: number; atEnd: number; carry: number; encash: number; lapse: number }[];
}

export interface PersonOption {
  id: string;
  label: string;
  detail: string | null;
}

// ------------------------------------------------------------------------------------------ batch 2

export type Scope = 'company' | 'granted' | 'team';
export interface ShiftRef {
  shiftId: string | null;
  name: string;
  start: number;
  end: number;
}
export interface RosterConflictRow {
  on: string;
  kind: 'rest' | 'overlap' | 'leave' | 'holiday' | 'night' | 'hours' | 'spread' | 'week' | 'weekly_off' | 'licence';
  message: string;
}
export interface RosterCell {
  on: string;
  employed: boolean;
  locked?: boolean;
  past?: boolean;
  /** In force: a shift id, 'off', or null (the pattern / location default). */
  published?: string | null;
  /** The planner's unpublished change: a shift id, 'off' or 'pattern'. */
  draft?: string | null;
  source?: 'roster' | 'pattern' | 'location';
  effective?: ShiftRef | null;
  planned?: ShiftRef | null;
  conflicts?: RosterConflictRow[];
}
export interface RosterWeek {
  week: string;
  to: string;
  today: string;
  scope: Scope;
  shifts: { id: string; code: string; name: string; colour: string; night: boolean; start: number | null; end: number | null }[];
  drafts: number;
  /** The working-time limits the checks used (the first person's; each person's own limits decide their conflicts). */
  rules?: { minRestHours: number; maxDailyHours: number; maxWeeklyHours: number; maxSpreadOverHours: number; minWeeklyOffs: number } | null;
  people: { id: string; name: string; code: string | null; cells: RosterCell[] }[];
}
/** TIM-05 Staff: my week, and my team's published roster when the company allows it (roster.staff_see_team). */
export interface TeamRosterWeek {
  week: string;
  to: string;
  today: string;
  /** False: the company shows employees only their own shifts. */
  team: boolean;
  shifts: RosterWeek['shifts'];
  people: { id: string; name: string; code: string | null; me: boolean; cells: { on: string; employed: boolean; shift: ShiftRef | null; off: boolean; leave: 'full' | 'half' | 'away' | null }[] }[];
}
export interface MyShifts {
  week: string;
  days: { on: string; shift: ShiftRef | null; off: boolean; employed: boolean }[];
  colleagues: { id: string; name: string }[];
  swaps: { id: string; on: string; mine: boolean; with: string; status: 'pending' | 'approved' | 'rejected' | 'withdrawn'; reason: string | null }[];
}

export interface ShiftVersionRow {
  validFrom: string;
  start: number;
  end: number;
  graceMinutes: number;
  halfDayMinutes: number;
  fullDayMinutes: number;
  breakMinutes: number;
  breakAboveMinutes: number;
  /** TIM-06 flexi: core hours (minutes of the day) and overtime after hours worked (null: the full day). */
  coreStart?: number | null;
  coreEnd?: number | null;
  otAfterMinutes?: number | null;
  /** TIM-06 split: the first part ends and the second starts (start to firstEnd, secondStart to end). */
  firstEnd?: number | null;
  secondStart?: number | null;
}
/** TIM-06 shift types: fixed (with night shifts that end next day), flexi with core hours, split in two parts. */
export type ShiftKind = 'fixed' | 'flexi' | 'split';
export interface ShiftRow {
  id: string;
  code: string;
  name: string;
  colour: string;
  night: boolean;
  active: boolean;
  /** Fixed when absent; never changes once saved. */
  kind?: ShiftKind;
  versions: ShiftVersionRow[];
}
export interface OtRuleRow {
  id: string;
  name: string;
  scopeType: string;
  scopeId: string;
  scopeName: string;
  validFrom: string;
  minMinutes: number;
  roundMinutes: number;
  dailyCapMinutes: number | null;
  rateNormal: number;
  rateWeeklyOff: number;
  rateHoliday: number;
  needsApproval: boolean;
  settle: 'pay' | 'comp_off';
  compOffHalfMinutes: number;
  compOffFullMinutes: number;
  removable: boolean;
}
export type OtRuleInput = Omit<OtRuleRow, 'id' | 'scopeName' | 'removable' | 'scopeId'> & { scopeId?: string };
export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  managerUserId: string | null;
  managerName: string | null;
  billable: boolean;
  activities: string[];
  active: boolean;
}
export interface ShiftSetup {
  today: string;
  shifts: ShiftRow[];
  patterns: { id: string; name: string; kind: 'weekly' | 'cycle'; cycle: (string | null)[]; active: boolean; assignments: { id: string; scopeType: string; scopeId: string; scopeName: string; validFrom: string; offsetDays: number; removable: boolean }[] }[];
  otRules: OtRuleRow[];
  projects: ProjectRow[];
  night: {
    locations: { locationId: string; name: string; window: { start: number; end: number }; items: { item: string; label: string; attestedOn: string | null; reviewDue: string | null; note: string | null; ok: boolean }[] }[];
    consents: { id: string; employeeId: string; name: string; locationId: string; location: string; givenOn: string; withdrawnOn: string | null; reference: string; confirmedAt?: string | null }[];
    /** People who opted in to the night-work protection themselves (only they can turn it off). */
    optIns?: { employeeId: string; name: string; since: string }[];
  };
  hasCompOffType: boolean;
  locations: { id: string; name: string; state: string }[];
  departments: { id: string; name: string }[];
  entities: { id: string; name: string }[];
  people: { id: string; name: string; code: string | null }[];
  users: { id: string; name: string }[];
  /** The shift types the company turned on (company settings, off by default) and a split's shortest gap in minutes. */
  types?: { flexi: boolean; split: boolean; minGapMinutes: number; flexiLate?: 'core_start' | 'never'; flexiShort?: 'shift_hours' | 'core_hours' };
}
export interface ShiftInput {
  code: string;
  name: string;
  colour: string;
  night: boolean;
  validFrom: string;
  start: number;
  end: number;
  graceMinutes: number;
  halfDayMinutes: number;
  fullDayMinutes: number;
  breakMinutes: number;
  breakAboveMinutes: number;
  kind?: ShiftKind;
  coreStart?: number | null;
  coreEnd?: number | null;
  otAfterMinutes?: number | null;
  firstEnd?: number | null;
  secondStart?: number | null;
}

export type OtCategory = 'normal' | 'weekly_off' | 'holiday';
export interface OtClaim {
  id: string;
  employeeId: string;
  on: string;
  category: OtCategory;
  workedMinutes: number;
  scheduledMinutes: number;
  eligibleMinutes: number;
  payableMinutes: number;
  overCapMinutes: number;
  rate: number;
  settle: 'pay' | 'comp_off';
  compOffDays: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  overridden: boolean;
  overrideReason: string | null;
  /** TIM-07 Ot: the minutes pre-approved for the day when claimed (null: none; older servers leave it out). */
  preApprovedMinutes?: number | null;
  name?: string;
  code?: string | null;
  canOverride?: boolean;
  /** TIM-09: the viewer's open approval task for the claim (decide here or in Approvals: one engine). */
  taskId?: string | null;
  canCompOff?: boolean;
}
/** Me › Attendance › Night work (founder decisions 9 Oct 2026). */
export interface MyNightWork {
  /** Covered because of the recorded gender (female or transgender). */
  byRecord: boolean;
  optedIn: boolean;
  optedInSince: string | null;
  consents: { id: string; location: string; givenOn: string; withdrawnOn: string | null; reference: string; confirmedAt: string | null }[];
}
export interface NightCodeSent {
  sentTo: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}
export interface MyOvertime {
  today: string;
  claims: OtClaim[];
  open: { on: string; category: OtCategory; workedMinutes: number; scheduledMinutes: number; eligibleMinutes: number; payableMinutes: number; overCapMinutes: number; settle: 'pay' | 'comp_off'; factoriesAct?: boolean; needsApproval: boolean }[];
}
export interface OtReview {
  month: string;
  scope: Scope;
  claims: OtClaim[];
}

export interface MyTimesheet {
  week: string;
  mode: string;
  sheet: { id: string; status: 'draft' | 'pending' | 'approved' | 'rejected'; totalMinutes: number } | null;
  /** Projects P-2 (1406): each line's decision, its reason (the person sees it) and the hours approved; 1408: the client's decision. */
  lines: { id: string; projectId: string; activity: string | null; billable: boolean; minutes: number[]; /** Answer 1787: a comment per day, Monday to Sunday. */ comments?: string[]; decision?: 'pending' | 'approved' | 'reduced' | 'rejected' | null; reason?: string | null; approvedMinutes?: number[] | null; unallocated?: boolean; clientStatus?: 'waiting' | 'approved' | 'sent_back' | null; clientNote?: string | null }[];
  projects: { id: string; code: string; name: string; billable: boolean; activities: string[]; active: boolean }[];
  days: { on: string; holiday: string | null; leave: string | null; locked: boolean }[];
  recent: { id: string; week: string; status: string; totalMinutes: number }[];
  /** Answer 1787: the company's comment rule, per day with hours (absent from an older API: none asked). */
  noteRule?: { required: boolean; minWords: number };
}
export interface TimesheetLineInput {
  projectId: string;
  activity: string | null;
  billable: boolean;
  minutes: number[];
  /** Answer 1787: a comment per day, Monday to Sunday, in the person's own words. */
  comments?: string[];
}

export interface Periods {
  year: string;
  today: string;
  entities: {
    id: string;
    name: string;
    /** TIM-11: one step (HR locks) or two (HR sends, payroll approves), and what this viewer may do. */
    flow?: 'one_step' | 'two_step';
    canLock?: boolean;
    canApprove?: boolean;
    months: { month: string; stage: 'open' | 'frozen' | 'locked' | 'filed'; reopenAsked?: boolean; changedAt: string | null; changedBy: string | null; reason: string | null; lockable: boolean; lockableFrom?: string; sentAt?: string | null; sentBy?: string | null; sentByMe?: boolean }[];
  }[];
}
export interface Preflight {
  month: string;
  lockableFrom: string;
  people: number;
  pending: { kind: string; count: number }[];
  exceptions: number;
}
export interface FeedRow {
  employeeId: string;
  name: string;
  code: string | null;
  mode: string;
  calendarDays: number;
  paidDays: number;
  lopDays: number;
  otNormalMinutes: number;
  otWeeklyOffMinutes: number;
  otHolidayMinutes: number;
  nightShifts: number;
  compOffDays: number;
  timesheetMinutes: number;
  unevaluatedDays: number;
  layoffDays?: number;
  heldDays?: number;
  lateLopDays?: number;
}
export interface PayrollFeed {
  entity: { id: string; name: string };
  month: string;
  frozen: boolean;
  lockedAt: string | null;
  rows: FeedRow[];
}
export interface Registers {
  month: string;
  locations: { id: string; name: string; state: string; entityId: string; entity: string; people: number; locked: boolean; formats: { type: 'muster' | 'leave'; title: string; form: string; columns: string[] }[]; source: string | null; verify: boolean }[];
}

// ------------------------------------------------------------------------------------------ leave v2 (29 Oct 2026)

/** GET /time/me/leave/ledger: my leave card (TIM-21 employee). */
export interface MyLeaveCard {
  employee: { id: string; name: string; code: string | null };
  today: string;
  year: { start: string; end: string };
  balances: LeaveBalanceRow[];
  ledger: LedgerRow[];
  pending: { id: string; leaveTypeId: string; from: string; to: string; days: number }[];
}

/** GET /time/me/comp-off (TIM-22). */
export interface MyCompOff {
  enabled: boolean;
  today: string;
  within: number;
  expiryDays: number | null;
  eligible: { on: string; kind: 'weekly_off' | 'holiday'; holiday: string | null; workedMinutes: number; maxDays: number }[];
  claims: { id: string; on: string; kind: string; workedMinutes: number; days: number; reason: string; status: string; useBy: string | null; createdAt: string; decidedAt: string | null }[];
  credits: { id: string; on: string; days: number; reason: string; useBy: string | null }[];
}

/** GET /time/me/encashment (TIM-24). */
export interface MyEncashment {
  today: string;
  window: string;
  open: boolean;
  maxPerYear: number;
  minLeft: number;
  divisor: number;
  basis: string;
  monthly: number | null;
  dailyRate: number | null;
  year: { start: string; end: string };
  types: { leaveTypeId: string; name: string; balance: number; pending: number; available: number; encashedThisYear: number; max: number }[];
  taxNote: string;
  waiting: EncashmentRow | null;
  history: EncashmentRow[];
}
export interface EncashmentRow {
  id: string;
  leaveTypeId: string;
  days: number;
  dailyRate: number | null;
  amount: number | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

/** A long absence (TIM-25). */
export interface LongAbsenceRow {
  id: string;
  employeeId: string;
  name: string | null;
  kind: 'maternity' | 'sabbatical' | 'lwp';
  from: string;
  to: string;
  plannedTo: string;
  accrues: boolean;
  linkedRequest: string | null;
  returnAskedOn: string | null;
  returnAskedNote: string | null;
  note: string;
  version: number;
}

/** GET /time/hr/leave-home (TIM-17 HR). */
export interface HrLeaveHome {
  today: string;
  pending: { total: number; rows: { id: string; employeeId: string; name: string; type: string; from: string; to: string; days: number; sent: string; approvers: string | null }[] };
  away: { employeeId: string; name: string; from: string; to: string; type: string; pending: boolean }[];
  negative: number;
  certificates: { id: string; name: string; type: string; from: string; to: string }[] | null;
  yearEnd: { on: string; posted: boolean; nextOn: string };
}

/** TIM-17 Manager: GET /time/team/leave-home (the manager's own team only). */
export interface TeamLeaveHome {
  today: string;
  /** Leave waiting for my decision: `taskId` is my approval task (decided through the approvals inbox's API). */
  waiting: { id: string; taskId: string; employeeId: string; name: string; type: string; from: string; to: string; fromHalf: 'full' | 'second'; toHalf: 'full' | 'first'; days: number; certificate: 'none' | 'pending' | 'verified'; sent: string; others: { name: string; type: string }[]; /** False when the company turned send back off. */ canSendBack?: boolean }[];
  /** Other approvals waiting for me (attendance, overtime, comp-off …). */
  otherWaiting: number;
  away: { employeeId: string; name: string; type: string; from: string; to: string }[];
}

/** TIM-19 Manager: GET /time/requests/:id as someone else's request (team availability, balance after, my task). */
export interface LeaveRequestDetailView extends LeaveRequestRow {
  person: { name: string; code: string | null } | null;
  team: { others: { name: string; type: string }[]; balanceAfter: number | null; taskId: string | null; /** False when the company turned send back off. */ canSendBack?: boolean } | null;
}

export type LeaveReportKind = 'balances' | 'taken' | 'ledger' | 'lop' | 'negative' | 'liability';
export interface LeaveReportQuery {
  report: LeaveReportKind;
  entityId?: string;
  locationId?: string;
  departmentId?: string;
  q?: string;
  month?: string;
  page: number;
  pageSize: number;
}
/** GET /time/hr/leave-report (TIM-30). Rows differ by report. */
export interface LeaveReport {
  report: LeaveReportKind;
  types: { id: string; code: string; name: string; kind: string; hasBalance: boolean; paid: boolean }[];
  total: number;
  page: number;
  pageSize: number;
  month?: string;
  filters: { entities: { id: string; name: string }[]; locations: { id: string; name: string }[]; departments: { id: string; name: string }[] };
  rows: LeaveReportRow[];
  /** Liability: the viewer may see pay for at least one legal entity (else no money fields are sent). */
  money?: boolean;
  /** Liability: unused days that can be cashed in, everyone in scope. */
  totalDays?: number;
  /** Liability, pay viewers only: daily pay = monthly pay on this basis ÷ this divisor (company settings). */
  dailyPayRule?: { basis: string; divisor: string };
}
export interface LeaveReportRow {
  employeeId: string;
  name: string;
  code: string | null;
  location?: string | null;
  department?: string | null;
  values?: Record<string, number>;
  id?: string;
  on?: string;
  type?: string;
  kind?: string;
  days?: number;
  reason?: string;
  lopLeave?: number;
  absent?: number;
  /** Liability, pay viewers only (absent for others): null with noPay when the person has no pay set up. */
  dailyPay?: number | null;
  amount?: number | null;
  noPay?: boolean;
}

/** Founder decision 1: GET /time/hr/long-absences/check (before Record long absence). */
export interface LongAbsenceCheck {
  name: string | null;
  accrues: boolean;
  comesBackOn: string;
  leave: { id: string; type: string; from: string; to: string; status: string }[];
  /** Why it can't be recorded, in plain English (empty: fine). */
  problems: string[];
}
export type LongAbsenceInput = { employeeId: string; kind: 'sabbatical' | 'lwp'; from: string; to: string; note: string };

/** Founder decision 1: GET /time/setup/block-dates. */
export interface BlockDates {
  mode: 'block' | 'warn';
  dates: { id: string; from: string; to: string; reason: string; scopeType: 'tenant' | 'legal_entity' | 'location'; scopeId: string | null; scopeName: string | null; leaveTypeIds: string[]; affected: { id: string; name: string; type: string; from: string; to: string; status: string }[] }[];
  types: { id: string; name: string; kind: string; stoppedByDefault: boolean; canStop: boolean }[];
  entities: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}
export type BlockDateInput = { from: string; to: string; reason: string; scopeType: 'tenant' | 'legal_entity' | 'location'; scopeId?: string; leaveTypeIds?: string[] };

/** GET /time/hr/block-leave (TIM-39). */
export interface BlockLeaveList {
  today: string;
  rows: { employeeId: string; name: string; code: string | null; need: number; status: 'taken' | 'planned' | 'not_planned'; plan: { from: string; to: string; accessPause: 'none' | 'scheduled'; version: number } | null; nudgedAt: string | null; earnedLeft: number; canPlan: boolean }[];
}

/** GET /time/setup/holiday-feeds (TIM-42). */
export interface HolidayFeeds {
  on: boolean;
  provider: string;
  states: { code: string; name: string }[];
  feeds: { id: string; state: string; stateName: string; provider: string; checkedAt: string | null; checkError: string | null; locations: { id: string; name: string; hasCalendar: boolean }[]; waiting: number }[];
  changes: { id: string; feedId: string; calendar: string; action: 'add' | 'remove'; on: string; name: string; peopleOnLeave: number }[];
}

// ------------------------------------------------------------------------------------------ time ops (29 Oct 2026)

/** TIM-01 Today board. */
export type BoardStatus = 'in' | 'late' | 'missing' | 'not_in' | 'leave' | 'wfh' | 'od' | 'off' | 'rest';
export interface TodayBoard {
  today: string;
  at: string;
  scope: Scope;
  month: string;
  lockableFrom: string;
  /** Open exceptions this month among these people (missing punches or timesheets). */
  blocking: number;
  people: { id: string; name: string; code: string | null; role: string; dept: string; location: string; status: BoardStatus; inAt: string | null; onSite: boolean; site: string; mode: 'Punch' | 'Assumed present' | 'Timesheet'; source: 'web' | 'field' | null; detail: string | null; missedOutOn: string | null; nudged: boolean; shiftStarted: boolean; today: string | null }[];
}

/** TIM-04 exceptions. */
export interface ExceptionsList {
  month: string;
  today: string;
  scope: Scope;
  canResolve: boolean;
  /** One page of the list (the server pages and filters it). */
  page: number;
  pageSize: number;
  total: number;
  /** Open days with a missing punch or timesheet in the whole scope (the header badge). */
  blocking: number;
  rows: {
    id: string;
    employeeId: string;
    person: string;
    code: string | null;
    on: string;
    kind: string;
    status: 'Open' | 'Request pending' | 'Resolved';
    blocking: boolean;
    mode: 'Punch' | 'Timesheet';
    detail: string;
    firstIn: string | null;
    /** The check-in on record and the shift's end, in the person's zone ("HH:MM"). */
    inAt: string | null;
    shiftEnd: string | null;
    nudged: number;
    request: { id: string; kind: string; inMinute: number | null; outMinute: number | null; reason: string; taskId: string | null } | null;
    resolution: { how: 'present' | 'absent'; reason: string; by: string | null; at: string } | null;
  }[];
}

/** TIM-16 late and early / overtime report rows. */
export interface AttendanceReport {
  month: string;
  upTo: string;
  scope: Scope;
  stage: 'open' | 'frozen' | 'locked' | 'filed' | null;
  rows: { id: string; name: string; code: string | null; dept: string; location: string; late: number; early: number; otMinutes: number; lop: number }[];
}
export interface NightRegister {
  month: string;
  stage: 'open' | 'frozen' | 'locked' | 'filed' | null;
  rows: { id: string; name: string; code: string | null; location: string; shifts: number; nightMinutes: number; consent: { reference: string; givenOn: string; withdrawnOn: string | null; confirmed: boolean } | null }[];
}

/** TIM-37 industrial action. */
export type IndustrialKind = 'strike' | 'lockout' | 'layoff';
export type Legality = 'legal' | 'illegal' | 'undetermined';
export interface IndustrialEvent {
  id: string;
  kind: IndustrialKind;
  from: string;
  to: string;
  days: number;
  location: { id: string; name: string; state: string };
  department: { id: string; name: string } | null;
  workers: number;
  legality: Legality;
  legalitySetAt: string | null;
  legalitySetBy: string | null;
  notice: string;
  status: 'active' | 'cancelled';
  version: number;
  today: string;
}
/** Decision 7b: past strikes, lockouts and lay-offs in scope, newest first, one page (25 / 50 / 100). */
export interface IndustrialList {
  events: IndustrialEvent[];
  total: number;
  page: number;
  pageSize: number;
  today: string;
}
export interface IndustrialOptions {
  today: string;
  locations: { id: string; name: string; state: string; people: number; departments: { id: string; name: string; people: number }[] }[];
}
export interface IndustrialInput {
  kind: IndustrialKind;
  locationId: string;
  departmentId?: string;
  from: string;
  to: string;
  legality: Legality;
  notice: string;
}

/** TIM-36 presence days. */
export interface PresenceDayRow {
  id: string;
  employeeId: string;
  person: string;
  dept?: string;
  on: string;
  status: DayStatus | null;
  byPresence: boolean;
  activeMinutes: number | null;
  first: string | null;
  last: string | null;
  webIn: string | null;
  webOut: string | null;
  consent: { givenAt: string | null; version: string | null } | null;
  withdrawnAt: string | null;
}
export interface MyPresence {
  month: string;
  today: string;
  enabled: boolean;
  notice: string;
  consent: { id: string; givenAt: string; noticeVersion: string } | null;
  history: { id: string; givenAt: string; withdrawnAt: string | null; noticeVersion: string }[];
  days: PresenceDayRow[];
}
export interface TeamPresence {
  month: string;
  scope: 'hr' | 'team';
  days: PresenceDayRow[];
}

/** TIM-10 device backfill. */
export interface DeviceBatch {
  legalEntityId: string;
  entityName: string;
  deviceRef: string;
  punches: number;
  people: number;
  from: string | null;
  to: string | null;
  receivedAt: string | null;
}
export interface DeviceDayView {
  status: DayStatus;
  lateMinutes: number | null;
  firstIn: string | null;
  lastOut: string | null;
}
export interface DevicePreview {
  deviceRef: string;
  from: string;
  to: string;
  receivedAt: string;
  punches: number;
  people: number;
  personDays: number;
  becomePresent: number;
  lateRemoved: number;
  lateAdded: number;
  corrections: number;
  changes: { employeeId: string; name: string; code: string | null; on: string; open: boolean; stage: string; punches: { kind: string; at: string | null }[]; before: DeviceDayView | null; after: DeviceDayView | null }[];
}

/** Answer 141: who the Factories Act covers at a location (overtime at the legal rate, the 240-day earned leave rule). */
export interface FactoriesActCover {
  covered: boolean;
  /** registered_factory: the location's flag; setting: attendance.factories_act (where no flag); default: neither. */
  source: 'registered_factory' | 'excluded' | 'setting' | 'default';
  scopeType: string | null;
  /** Departments and employment types the setting marks "not covered" (office staff on a factory site). */
  exclusions: { scopeType: string; name: string }[];
  /** Answer 151: the location's own setting value in force today (null: none). */
  locationSetting?: string | null;
}
