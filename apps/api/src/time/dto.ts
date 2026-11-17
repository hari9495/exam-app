import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, ValidateNested, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DATE = { strict: true } as const;

export class LeavePlanDto {
  @IsUUID()
  leaveTypeId!: string;

  @IsDateString(DATE)
  from!: string;

  @IsDateString(DATE)
  to!: string;

  @IsOptional()
  @IsIn(['full', 'second'])
  fromHalf?: 'full' | 'second';

  @IsOptional()
  @IsIn(['full', 'first'])
  toHalf?: 'full' | 'first';

  /** Maternity (YX-LV-10): the expected date of delivery (or of the event) and the case. */
  @IsOptional()
  @IsDateString(DATE)
  expectedOn?: string;

  @IsOptional()
  @IsIn(['birth', 'third_child', 'adoption', 'miscarriage', 'tubectomy'])
  maternityCase?: 'birth' | 'third_child' | 'adoption' | 'miscarriage' | 'tubectomy';
}

export class ApplyLeaveDto extends LeavePlanDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  /** "Approves for me while I am away" (P03 Q3): someone of the company. */
  @IsOptional()
  @IsUUID()
  delegateUserId?: string;

  /** A certificate will be given (required for long medical leave; HR verifies it, YX-LV-09). */
  @IsOptional()
  @IsBoolean()
  certificate?: boolean;

  /** Batch A C4 (answer 2313): up to 10 colleagues told on approval, with the dates only. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  notifyUserIds?: string[];
}

/** Batch A D12: days of approved leave to cancel, with a reason. */
export class CancelDaysDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(366)
  @ArrayUnique()
  @IsDateString(DATE, { each: true })
  days!: string[];

  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** Batch A D12: extend leave to a new last day (a new request linked to it). */
export class ExtendLeaveDto {
  @IsDateString(DATE)
  to!: string;

  @IsOptional()
  @IsIn(['full', 'first'])
  toHalf?: 'full' | 'first';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReasonDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AdjustDto {
  @IsUUID()
  leaveTypeId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-100)
  @Max(100)
  days!: number;

  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** Batch A D10 (answer 2314): one cell of the balance grid, from the balance HR saw to the corrected one, with a reason. */
export class CorrectBalanceDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  leaveTypeId!: string;

  /** The balance HR saw: a different one now means someone changed it since (409). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-1000)
  @Max(1000)
  from!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-1000)
  @Max(1000)
  to!: number;

  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RangeQueryDto {
  @IsDateString(DATE)
  from!: string;

  @IsDateString(DATE)
  to!: string;
}

const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn', 'cancel_pending', 'cancelled', 'sent_back', 'resent'] as const;
const csv = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').map((x) => x.trim()).filter(Boolean) : value);

/** Batch A item 2 (C2): my full leave history, filtered, a page at a time. */
export class LeaveHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  types?: string[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(LEAVE_STATUSES, { each: true })
  statuses?: string[];

  @IsOptional()
  @IsDateString(DATE)
  from?: string;

  @IsOptional()
  @IsDateString(DATE)
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** Batch A item 9 (D11): a holiday or weekly off marked as a working day. */
export class WorkingDayDto {
  @IsDateString(DATE)
  on!: string;

  @IsString()
  @MinLength(5, { message: 'Say why the day is worked (at least 5 characters).' })
  @MaxLength(300)
  reason!: string;
}

export class MonthQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}

export { EntityFilterDto } from '../common/entity-filter.dto';

export class MonthEntityQueryDto extends MonthQueryDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class RangeEntityQueryDto extends RangeQueryDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class PunchDto {
  @IsIn(['in', 'out', 'break_start', 'break_end'])
  kind!: 'in' | 'out' | 'break_start' | 'break_end';

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracyM?: number;

  /** ChoseWfh: outside the office, clock in as work from home today (a request goes to the manager). */
  @IsOptional()
  @IsBoolean()
  wfh?: boolean;

  /** WithNote: a short note kept with this punch (never changed afterwards). */
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1, { message: 'Write a note, or leave the note out.' })
  @MaxLength(200, { message: 'Keep the note to 200 characters.' })
  note?: string;
}

export class WfhDto {
  @IsDateString(DATE)
  on!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/** Batch A item 7 (B4): hourly permission, a from and to time on one working day with a reason (never uses leave). */
export class PermissionDto {
  @IsDateString(DATE)
  on!: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  inMinute!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  outMinute!: number;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/** TIM-07 OnDuty: a day, or part of it, on duty away from the office (a place, from and to, a reason). */
export class OnDutyDto {
  @IsDateString(DATE)
  on!: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  inMinute!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  outMinute!: number;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  place!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  /** Sending again a request that was sent back for changes (it is closed as "sent again"). */
  @IsOptional()
  @IsUUID()
  resendOf?: string;
}

export class RegulariseDto {
  @IsDateString(DATE)
  on!: string;

  @IsIn(['missed_in', 'missed_out', 'wrong_time', 'full_day'])
  kind!: 'missed_in' | 'missed_out' | 'wrong_time' | 'full_day';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  inMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  outMinute?: number;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

// ------------------------------------------------------------------------------------------ set-up

export class LeaveTypeDto {
  @trim()
  @Matches(/^[A-Z][A-Z0-9]{0,7}$/, { message: 'A code is 1 to 8 capital letters or digits, starting with a letter (EL, CL, SL).' })
  code!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsIn(['earned', 'casual', 'sick', 'lop', 'comp_off', 'maternity', 'paternity', 'other'])
  kind!: string;

  @IsBoolean()
  paid!: boolean;

  @IsOptional()
  @IsIn(['blue', 'green', 'teal', 'purple', 'orange', 'pink', 'grey', 'red'])
  colour?: string;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PolicyDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class PolicyVersionDto {
  @IsDateString(DATE)
  validFrom!: string;

  /** Checked line by line in the service (parseLines). */
  @IsArray()
  lines!: unknown[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AssignPolicyDto {
  @IsIn(['employee', 'designation', 'grade', 'employment_type', 'department', 'location', 'legal_entity', 'tenant'])
  scopeType!: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsDateString(DATE)
  validFrom!: string;
}

export class CalendarDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** Empty: the company calendar for locations without their own. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsIn(['first', 'second'])
  halfDayOpenHalf?: 'first' | 'second';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  optionalLimit?: number;

  /** TIM-26: a holiday on the location's weekly off gives nothing extra, the next working day off, or a comp-off day. */
  @IsOptional()
  @IsIn(['none', 'substitute', 'comp_off'])
  onWeeklyOff?: 'none' | 'substitute' | 'comp_off';

  /** TIM-26: optional holidays after a move to this office: split by months, or this office's full number. */
  @IsOptional()
  @IsIn(['share', 'reset'])
  onMove?: 'share' | 'reset';
}

export class HolidayDto {
  @IsDateString(DATE)
  on!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsIn(['national', 'state', 'festival', 'optional', 'restricted'])
  kind!: string;

  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;
}

export class HolidayDateDto {
  @IsDateString(DATE)
  on!: string;
}

export class CalendarTemplateDto {
  @IsUUID()
  locationId!: string;
}

export class PublishDraftDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export class PolicyOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  policyIds!: string[];

  @IsDateString(DATE)
  validFrom!: string;
}

export class AttendanceRuleDto {
  @IsDateString(DATE)
  validFrom!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  shiftName?: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  shiftStart!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  shiftEnd!: number;

  @IsInt()
  @Min(0)
  @Max(120)
  graceMinutes!: number;

  /** Q1: ISO weekdays off (1 = Monday … 7 = Sunday), each optionally only on its nth weeks of the month. */
  @IsArray()
  weeklyOffs!: unknown[];

  @IsIn(['restricted', 'field'])
  checkIn!: 'restricted' | 'field';
}

export class YearEndDto {
  @IsDateString(DATE)
  yearEnd!: string;
}

/** TIM-29 posting: HR may post with leave requests still waiting (they stay pending into the new year). */
export class YearEndRunDto extends YearEndDto {
  @IsOptional()
  @IsBoolean()
  acknowledgePending?: boolean;
}

/** TIM-29 Transition: change the leave year of one legal entity (preview with GET, schedule with POST). */
export class YearChangeDto {
  @IsUUID()
  legalEntityId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  newStartMonth!: number;
}

// ------------------------------------------------------------------------------------------ batch 2: shifts and rosters

const COLOURS = ['blue', 'green', 'teal', 'purple', 'orange', 'pink', 'grey', 'red'];

export class ShiftTimesDto {
  @IsDateString(DATE)
  validFrom!: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  start!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  end!: number;

  @IsInt()
  @Min(0)
  @Max(120)
  graceMinutes!: number;

  @IsInt()
  @Min(30)
  @Max(960)
  halfDayMinutes!: number;

  @IsInt()
  @Min(30)
  @Max(960)
  fullDayMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(120)
  breakMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(960)
  breakAboveMinutes!: number;

  /** TIM-06 flexi: core hours (wall-clock minutes inside the shift) and overtime after hours worked (default the full day). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  coreStart?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  coreEnd?: number | null;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(960)
  otAfterMinutes?: number | null;

  /** TIM-06 split: the first part ends and the second starts (start = first part from, end = second part to). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  firstEnd?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  secondStart?: number | null;
}

export class ShiftDto extends ShiftTimesDto {
  /** TIM-06: fixed (default), flexi or split; never changes once saved. Flexi and split need the company setting on. */
  @IsOptional()
  @IsIn(['fixed', 'flexi', 'split'])
  kind?: 'fixed' | 'flexi' | 'split';

  @trim()
  @Matches(/^[A-Z][A-Z0-9]{0,5}$/, { message: 'A shift code is 1 to 6 capital letters or digits, starting with a letter (M, A, N, GEN).' })
  code!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsIn(COLOURS)
  colour!: string;

  @IsBoolean()
  night!: boolean;
}

export class ShiftDetailsDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsIn(COLOURS)
  colour!: string;

  @IsBoolean()
  night!: boolean;

  @IsBoolean()
  active!: boolean;
}

export class PatternDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsIn(['weekly', 'cycle'])
  kind!: 'weekly' | 'cycle';

  /** Shift ids or null (a weekly off); checked in the service. */
  @IsArray()
  cycle!: (string | null)[];
}

export class ActiveDto {
  @IsBoolean()
  active!: boolean;
}

export class PatternAssignDto {
  @IsIn(['employee', 'department', 'location', 'legal_entity', 'tenant'])
  scopeType!: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsDateString(DATE)
  validFrom!: string;

  @IsInt()
  @Min(0)
  @Max(55)
  offsetDays!: number;
}

export class WeekQueryDto {
  @IsDateString(DATE)
  week!: string;
}

export class RosterCellDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString(DATE)
  on!: string;

  /** A shift id, 'off', or 'pattern' (back to the pattern / location default). */
  @Matches(/^(off|pattern|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
  value!: string;
}

/** Batch A B6 (answer 2316): one change for the ticked people of the roster, from a date. */
export class RosterBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  employeeIds!: string[];

  @IsDateString(DATE)
  from!: string;

  @IsIn(['shift', 'weekly_off', 'penalty'])
  change!: 'shift' | 'weekly_off' | 'penalty';

  /** shift: the new shift; weekly_off: the shift for anyone on the location's usual shift. */
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  /** weekly_off: the weekly-off days, 1 = Monday … 7 = Sunday. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weeklyOffs?: number[];

  /** penalty: late marks a month without a deduction, and what each one over costs (days of pay). */
  @IsOptional()
  @IsIn(['0', '1', '2', '3', '4', '5', '6'])
  lateMarksFree?: string;

  @IsOptional()
  @IsIn(['0', '0.5', '1'])
  lateMarkPenalty?: string;
}

export class RosterCellsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RosterCellDto)
  cells!: RosterCellDto[];
}

export class RosterCopyDto {
  @IsDateString(DATE)
  fromWeek!: string;

  @IsDateString(DATE)
  toWeek!: string;
}

export class SwapDto {
  @IsDateString(DATE)
  on!: string;

  @IsUUID()
  colleagueEmployeeId!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ConsentDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  locationId!: string;

  @IsDateString(DATE)
  givenOn!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reference!: string;
}

export class WithdrawConsentDto {
  @IsDateString(DATE)
  on!: string;
}

/** Me › Attendance: opt in to (or out of) the night-work protection (founder decision 9 Oct 2026). */
export class NightOptInDto {
  @IsBoolean()
  optIn!: boolean;
}

/** The one-time code that confirms a night-work consent. */
export class NightConfirmDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class SafeguardDto {
  @IsUUID()
  locationId!: string;

  @Matches(/^[a-z_]{1,30}$/)
  item!: string;

  @IsDateString(DATE)
  attestedOn!: string;

  @IsDateString(DATE)
  reviewDue!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  note!: string;
}

// ------------------------------------------------------------------------------------------ batch 2: overtime

export class OtRuleDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsIn(['employee', 'designation', 'grade', 'employment_type', 'department', 'location', 'legal_entity', 'tenant'])
  scopeType!: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsDateString(DATE)
  validFrom!: string;

  @IsInt()
  @Min(0)
  @Max(240)
  minMinutes!: number;

  @IsIn([1, 5, 10, 15, 30, 60])
  roundMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(720)
  dailyCapMinutes?: number | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(4)
  rateNormal!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(4)
  rateWeeklyOff!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(4)
  rateHoliday!: number;

  @IsBoolean()
  needsApproval!: boolean;

  @IsIn(['pay', 'comp_off'])
  settle!: 'pay' | 'comp_off';

  @IsInt()
  @Min(60)
  @Max(720)
  compOffHalfMinutes!: number;

  @IsInt()
  @Min(60)
  @Max(720)
  compOffFullMinutes!: number;
}

export class OtClaimDto {
  @IsDateString(DATE)
  on!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/** TIM-07 Ot: overtime asked for ahead (quarter hours, 0.5 to 12 h), paid or as comp-off. */
export class OtPlanDto {
  @IsDateString(DATE)
  on!: string;

  @IsInt()
  @Min(30)
  @Max(720)
  minutes!: number;

  @IsIn(['pay', 'comp_off'])
  takeAs!: 'pay' | 'comp_off';

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class OverrideDto {
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

// ------------------------------------------------------------------------------------------ batch 2: timesheets

export class TimesheetLineDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  activity?: string | null;

  @IsBoolean()
  billable!: boolean;

  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(1440, { each: true })
  minutes!: number[];

  /** Answer 1787: a comment per day, Monday to Sunday; at least N words on each day with hours to submit. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  comments?: string[];
}

export class TimesheetDto {
  @IsDateString(DATE)
  week!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TimesheetLineDto)
  lines!: TimesheetLineDto[];
}

// ------------------------------------------------------------------------------------------ batch 2: locks, registers, feed, eligibility

export class PeriodDto {
  @IsUUID()
  legalEntityId!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}

export class UnlockDto extends PeriodDto {
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class YearQueryDto {
  @Matches(/^\d{4}$/)
  year!: string;
}

export class YearEntityQueryDto extends YearQueryDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class RegisterQueryDto {
  @IsUUID()
  locationId!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;

  @IsIn(['pdf', 'xlsx'])
  format!: 'pdf' | 'xlsx';
}

export class EligibilityOverrideDto {
  @IsUUID()
  leaveTypeId!: string;

  @IsDateString(DATE)
  validUntil!: string;

  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

/** TIM-31 Multi: one check-in point of a location. */
export class GeoPointDto {
  @trim()
  @IsString()
  @MinLength(1, { message: 'Enter a point name' })
  @MaxLength(60)
  name!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsInt()
  @Min(50, { message: 'Enter a radius between 50 and 1,000 m' })
  @Max(1000, { message: 'Enter a radius between 50 and 1,000 m' })
  radiusM!: number;
}

/** TIM-31 Multi: every check-in point of a location (up to 20), with the location's updatedAt as last seen. */
export class GeoPointsDto {
  @IsArray()
  @ArrayMaxSize(20, { message: 'A location can have up to 20 points.' })
  @ValidateNested({ each: true })
  @Type(() => GeoPointDto)
  points!: GeoPointDto[];

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;
}

/** TIM-31: a location's office networks for web check-in, one IP range per line (checked again on the server). */
export class NetworksDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(43, { each: true })
  ipRanges!: string[];
}
