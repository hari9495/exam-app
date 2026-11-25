import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Time ops (29 Oct 2026): the attendance, overtime and period inputs of TIM-01/02/03/04/09/11/16/36/37.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DATE = { strict: true } as const;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class EntityQueryDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class OpsMonthQueryDto extends EntityQueryDto {
  @Matches(MONTH)
  month!: string;
}

export class DayRefDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString(DATE)
  on!: string;
}

/** HR resolves exceptions (TIM-04 / TIM-03 HrFix): present (times optional, both or neither) or absent, with a reason. */
export class ResolveDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DayRefDto)
  days!: DayRefDto[];

  @IsIn(['present', 'absent'])
  how!: 'present' | 'absent';

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
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** TIM-02 bulk: mark people present on one date of the muster's month, with a reason. */
export class MarkPresentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @IsUUID('all', { each: true })
  employeeIds!: string[];

  @IsDateString(DATE)
  on!: string;

  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class PeriodRefDto {
  @IsUUID()
  legalEntityId!: string;

  @Matches(MONTH)
  month!: string;
}

export class PeriodReasonDto extends PeriodRefDto {
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

/** TIM-09: one decision on an overtime claim through the shared approvals engine; comp-off approves it as time off. */
export class OtDecisionDto {
  @IsIn(['approve', 'reject', 'comp_off'])
  decision!: 'approve' | 'reject' | 'comp_off';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReportQueryDto extends OpsMonthQueryDto {
  @IsIn(['late', 'ot', 'night'])
  report!: 'late' | 'ot' | 'night';
}

/** TIM-37: an industrial-action event at one establishment. */
export class IndustrialActionDto {
  @IsIn(['strike', 'lockout', 'layoff'])
  kind!: 'strike' | 'lockout' | 'layoff';

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsDateString(DATE)
  from!: string;

  @IsDateString(DATE)
  to!: string;

  @IsIn(['legal', 'illegal', 'undetermined'])
  legality!: 'legal' | 'illegal' | 'undetermined';

  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  notice!: string;
}

export class LegalityDto {
  @IsIn(['legal', 'illegal', 'undetermined'])
  legality!: 'legal' | 'illegal' | 'undetermined';

  @IsInt()
  @Min(1)
  version!: number;
}

export class EventDatesDto {
  @IsDateString(DATE)
  from!: string;

  @IsDateString(DATE)
  to!: string;

  @IsInt()
  @Min(1)
  version!: number;
}

export class EventVersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

/** TIM-36: presence states the person's desktop app reports (their own, consent in force). */
export class PresenceSignalDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PresenceStateDto)
  signals!: PresenceStateDto[];
}

export class PresenceStateDto {
  @IsISO8601({ strict: true })
  at!: string;

  @IsIn(['active', 'idle', 'offline'])
  state!: 'active' | 'idle' | 'offline';
}

export class PresenceConsentDto {
  @IsIn(['give', 'withdraw'])
  action!: 'give' | 'withdraw';
}

/** TIM-10: the changes a held device batch would make, before it is applied. */
export class DeviceRefQueryDto {
  @IsUUID()
  legalEntityId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deviceRef!: string;
}

const list = () => Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((x: string) => x.trim()).filter(Boolean) : value));

/** TIM-04: one page of the month's exceptions, filtered on the server. */
/** TIM-37 past events: a page of 25, 50 or 100 (like the exceptions list). */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([25, 50, 100])
  pageSize?: number;
}

export class ExceptionsQueryDto extends OpsMonthQueryDto {
  @IsOptional()
  @list()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['Open', 'Request pending', 'Resolved'], { each: true })
  status?: string[];

  @IsOptional()
  @list()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(['Missing check-out', 'Missing check-in', 'No attendance', 'No approved timesheet'], { each: true })
  kind?: string[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([25, 50, 100])
  pageSize?: number;
}
