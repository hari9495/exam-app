// What the time and leave API returns (apps/api/src/time). The screens stay presentational; the API checks every call.

export type { LoadState } from '../../org/types';
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
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'cancel_pending' | 'cancelled';

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
  holidays: { calendar: { id: string; name: string; optionalLimit: number } | null; list: HolidayRow[] };
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
}

export interface PunchRow {
  id: string;
  kind: 'in' | 'out';
  at: string;
  source: string;
  accepted: boolean;
  refusal: string | null;
  verdict: string;
  distanceM: number | null;
  accuracyM: number | null;
  where: string | null;
}

export type DayStatus = 'present' | 'half_day' | 'absent' | 'leave' | 'holiday' | 'weekly_off' | 'missing_in' | 'missing_out' | 'no_timesheet' | 'not_started';

export interface DayRow {
  on: string;
  status: DayStatus;
  leavePart: Half | null;
  firstIn?: string | null;
  lastOut?: string | null;
  workedMinutes: number | null;
  lateMinutes: number | null;
  regularised: boolean;
}

export type FixKind = 'missed_in' | 'missed_out' | 'wrong_time' | 'full_day';

export interface FixRow {
  id: string;
  on: string;
  kind: FixKind;
  inMinute: number | null;
  outMinute: number | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
}

export interface MyAttendance {
  employee: { id: string; name: string };
  today: string;
  zone: string;
  mode: 'punch' | 'assumed_present' | 'timesheet';
  /** Today's shift from the roster, pattern or location (off: a weekly off today). */
  shift: { name: string; start: number; end: number; grace: number; checkIn: 'restricted' | 'field'; off?: boolean };
  fences: { name: string; lat: number; lng: number; radiusM: number }[];
  punches: PunchRow[];
  next: 'in' | 'out';
  days: DayRow[];
  requests: FixRow[];
  regularise: { limit: number; used: number };
}

export interface PunchResult {
  accepted: boolean;
  duplicate: boolean;
  kind: 'in' | 'out';
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
  people: { id: string; name: string; code: string | null; location: string; me: boolean; mode: string; missingPunchEffect: string; days: DayRow[] }[];
}

export interface DayCard {
  person: { name: string; code: string | null };
  on: string;
  zone: string;
  day: Omit<DayRow, 'on'> | null;
  punches: (PunchRow & { minute: number })[];
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
  noticeDays: number;
  certificateAfterDays: number | null;
  medical: boolean;
  negativeLimit: number;
  encashable: boolean;
  hrApprovalAboveDays: number | null;
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
  types: LeaveTypeRow[];
  policies: { id: string; name: string; archived: boolean; versions: { id: string; validFrom: string; lines: PolicyLine[]; note: string | null }[]; assignments: { id: string; scopeType: string; scopeId: string; scopeName: string; validFrom: string; removable: boolean }[] }[];
  calendars: { id: string; name: string; locationId: string | null; halfDayOpenHalf: 'first' | 'second'; optionalLimit: number; holidays: HolidayRow[] }[];
  locations: { id: string; name: string; state: string; timezone: string; geofence: { lat: number; lng: number; radiusM: number } | null; ipRanges: string[]; rule: LocationRule; upcoming: LocationRule[] }[];
  entities: { id: string; name: string }[];
  statutory: { jurisdiction: string; version: string; validFrom: string; values: { floors?: { kinds: string[]; days: number }[]; carry?: Record<string, number> }; source: string; verify: boolean }[];
}

export interface YearEndPreview {
  yearEnd: string;
  lapses: number;
  rows: { employeeId: string; name: string; code: string | null; type: string; balance: number; carry: number; lapse: number; encashable: boolean }[];
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
  kind: 'rest' | 'overlap' | 'leave' | 'holiday' | 'night';
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
  people: { id: string; name: string; code: string | null; cells: RosterCell[] }[];
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
}
export interface ShiftRow {
  id: string;
  code: string;
  name: string;
  colour: string;
  night: boolean;
  active: boolean;
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
  name?: string;
  code?: string | null;
  canOverride?: boolean;
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
  lines: { id: string; projectId: string; activity: string | null; billable: boolean; minutes: number[]; note: string | null }[];
  projects: { id: string; code: string; name: string; billable: boolean; activities: string[]; active: boolean }[];
  days: { on: string; holiday: string | null; leave: string | null; locked: boolean }[];
  recent: { id: string; week: string; status: string; totalMinutes: number }[];
}
export interface TimesheetLineInput {
  projectId: string;
  activity: string | null;
  billable: boolean;
  minutes: number[];
}

export interface Periods {
  year: string;
  today: string;
  entities: { id: string; name: string; months: { month: string; stage: 'open' | 'locked'; changedAt: string | null; changedBy: string | null; reason: string | null; lockable: boolean }[] }[];
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
