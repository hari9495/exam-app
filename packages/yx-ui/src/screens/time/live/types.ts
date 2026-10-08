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
}

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
  shift: { name: string; start: number; end: number; grace: number; checkIn: 'restricted' | 'field' };
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
