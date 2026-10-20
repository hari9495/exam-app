import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { MAX_BULK_CSV_LENGTH } from './bulk-csv';

// Request bodies and queries for the people core. Every field is whitelisted (the global pipe refuses
// anything else).

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  offset?: number;
}

export class OrgChartQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE, { message: 'asOf is a date (YYYY-MM-DD)' })
  asOf?: string;

  /** The top bar's legal entity: only that entity's people (PPL-02, founder 20 Oct 2026). */
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class ReportsQueryDto {
  @IsOptional()
  @IsIn(['direct', 'all'])
  scope?: 'direct' | 'all';
}

export class EmployeeCodeDto {
  @Matches(/^[A-Za-z0-9][A-Za-z0-9/_-]{0,29}$/, { message: 'employeeCode is up to 30 letters, digits, /, - or _' })
  employeeCode!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class LinkLoginDto {
  @IsUUID()
  userId!: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class ExtendProbationDto {
  @IsInt()
  @Min(1)
  @Max(12)
  months!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class BulkCsvDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_BULK_CSV_LENGTH)
  csv!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  /** Check and preview every row; nothing is kept. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ReassignDto {
  @IsUUID()
  fromManagerId!: string;

  @IsUUID()
  toManagerId!: string;

  @IsDateString({ strict: true })
  @Matches(DATE, { message: 'effectiveDate is a date (YYYY-MM-DD)' })
  effectiveDate!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

/** A raise: more than 0 and at most 100 per cent, up to two decimals. */
const RAISE = /^(?:100(?:\.0{1,2})?|[1-9]\d?(?:\.\d{1,2})?|0\.(?:[1-9]\d?|0[1-9]))$/;

export class RatingRaiseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  band!: string;

  @Matches(RAISE, { message: 'percent is more than 0 and at most 100, with up to 2 decimals' })
  percent!: string;
}

export class PersonRaiseDto {
  @IsUUID()
  employeeId!: string;

  @Matches(RAISE, { message: 'percent is more than 0 and at most 100, with up to 2 decimals' })
  percent!: string;
}

/** PPL-06 annual increment: the people, the rule, a raise per person where HR changed it. */
export class IncrementDto {
  @IsUUID()
  legalEntityId!: string;

  @IsDateString({ strict: true })
  @Matches(DATE, { message: 'effectiveDate is a date (YYYY-MM-DD)' })
  effectiveDate!: string;

  /** Confirmed employees who joined before this date. */
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE, { message: 'joinedBefore is a date (YYYY-MM-DD)' })
  joinedBefore?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  departmentIds?: string[];

  /** Ratings from this review cycle; by default the latest with released ratings in the entity. */
  @IsOptional()
  @IsUUID()
  reviewCycleId?: string;

  @IsIn(['rating', 'percent'])
  mode!: 'rating' | 'percent';

  @IsOptional()
  @Matches(RAISE, { message: 'percent is more than 0 and at most 100, with up to 2 decimals' })
  percent?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RatingRaiseDto)
  byRating?: RatingRaiseDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PersonRaiseDto)
  overrides?: PersonRaiseDto[];

  /** People to hold at the top of their pay range (the warn or block rule; under "cap" the company caps everyone). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  capped?: string[];

  /** The increment letter template; letters are made only once the batch is approved. */
  @IsOptional()
  @IsUUID()
  letterTemplateId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class IncrementLetterPreviewDto extends IncrementDto {
  @IsUUID()
  employeeId!: string;
}

export class BatchListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled'])
  status?: string;
}

export class BatchApproveDto {
  @IsOptional()
  @IsBoolean()
  confirmRebase?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
