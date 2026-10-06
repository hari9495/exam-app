import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
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
