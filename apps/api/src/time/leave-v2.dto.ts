import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// Leave v2 inputs (TIM-21…25, 29, 30, 39, 42). Every field is checked here; the rules are checked in the service.
const DATE = { strict: true } as const;

export class CompOffClaimDto {
  @IsDateString(DATE)
  on!: string;

  @IsIn([0.5, 1])
  days!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class EncashDto {
  @IsUUID()
  leaveTypeId!: string;

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(90)
  days!: number;
}

export class EncashPreviewQueryDto {
  @IsOptional()
  @IsUUID()
  leaveTypeId?: string;
}

export class BlockDateDto {
  @IsDateString(DATE)
  from!: string;

  @IsDateString(DATE)
  to!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;

  @IsIn(['tenant', 'legal_entity', 'location'])
  scopeType!: 'tenant' | 'legal_entity' | 'location';

  @IsOptional()
  @IsUUID()
  scopeId?: string;
}

export class LongAbsenceDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(['sabbatical', 'lwp'])
  kind!: 'sabbatical' | 'lwp';

  @IsDateString(DATE)
  from!: string;

  @IsDateString(DATE)
  to!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  note!: string;
}

export class DateNoteDto {
  @IsDateString(DATE)
  on!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note!: string;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class BlockPlanDto {
  @IsDateString(DATE)
  from!: string;

  @IsDateString(DATE)
  to!: string;
}

export class FeedDto {
  @IsString()
  @Matches(/^IN-[A-Z]{2}$/)
  state!: string;
}

export class FeedDecideDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  accept!: string[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ignore!: string[];
}

export class ReportQueryDto {
  @IsIn(['balances', 'taken', 'ledger', 'lop', 'negative'])
  report!: 'balances' | 'taken' | 'ledger' | 'lop' | 'negative';

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  /** Ledger and LOP: the month (yyyy-mm); balances and taken: as of today. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(200)
  pageSize?: number;
}

export class PauseDto {
  @IsBoolean()
  pause!: boolean;
}
