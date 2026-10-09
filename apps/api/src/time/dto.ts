import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

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

export class RangeQueryDto {
  @IsDateString(DATE)
  from!: string;

  @IsDateString(DATE)
  to!: string;
}

export class MonthQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}

export class PunchDto {
  @IsIn(['in', 'out'])
  kind!: 'in' | 'out';

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
}

export class ShiftDto extends ShiftTimesDto {
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

export class OverrideDto {
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

// ------------------------------------------------------------------------------------------ batch 2: timesheets

export class ProjectDto {
  @trim()
  @Matches(/^[A-Z][A-Z0-9-]{0,11}$/, { message: 'A project code is 1 to 12 capital letters, digits or dashes, starting with a letter.' })
  code!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsUUID()
  managerUserId?: string | null;

  @IsBoolean()
  billable!: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  activities!: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

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

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  note?: string | null;
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
