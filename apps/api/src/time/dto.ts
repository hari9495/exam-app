import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

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
