import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBase64, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, IsUrl, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Recruitment batch AT2 request bodies (M10-BUILD-DESIGN §18.1).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class PlanLineDto {
  /** HIR-01 revision: the approved line this row changes (kept so linked jobs stay on it); none = a new line. */
  @IsOptional()
  @IsUUID()
  id?: string | null;

  @IsUUID()
  designationId!: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsInt()
  @Min(1)
  @Max(10000)
  count!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  budget?: number | null;
}

export class PlanDto {
  @IsUUID()
  departmentId!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @IsInt()
  @Min(2000)
  @Max(2100)
  fyStart!: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PlanLineDto)
  lines!: PlanLineDto[];

  @IsOptional()
  @IsInt()
  version?: number;
}

export class PlanVersionDto {
  @IsInt()
  version!: number;
}

export class PlanQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fy?: number;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export const REQUISITION_REASONS = ['new', 'replacement'] as const;

// Recruitment batch AT3: careers site settings (M10-BUILD-DESIGN §6, §13).
export class ConsentNoticeDto {
  @IsIn(['application', 'talent_pool'])
  purpose!: 'application' | 'talent_pool';

  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  text!: string;
}

export class CareersEntityDto {
  @trim()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Use lower-case letters, numbers and single hyphens.' })
  @MaxLength(60)
  slug!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  headline?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000)
  intro?: string | null;

  @IsOptional()
  @Matches(/^(#[0-9a-fA-F]{6})?$/, { message: 'Use a colour like #1f6feb.' })
  primaryColor?: string | null;
}

/** HIR-11 cost types a person enters (posting = a job-board cost recorded before HIR-11). */
export const COST_TYPES_ENTERED = ['job_board', 'agency_fee', 'event', 'other'] as const;

export class RecruitingCostDto {
  @IsOptional()
  @IsUUID()
  jobId?: string | null;

  @IsOptional()
  @IsUUID()
  jobBoardId?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  source?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  amount!: number;

  @Matches(/^[A-Z]{3}$/, { message: 'Use a 3-letter currency code like INR.' })
  currency!: string;

  /** HIR-11: what the money was for. Referral bonuses and assessments are posted by the system, never typed here. */
  @IsOptional()
  @IsIn(COST_TYPES_ENTERED, { message: 'Choose job board, agency fee, event or other.' })
  costType?: (typeof COST_TYPES_ENTERED)[number];

  @IsOptional()
  @IsDateString({ strict: true })
  period?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/** HIR-02 answer 253: why the requisition is cancelled (required). */
export class CancelRequisitionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** Settings 6.1 Hiring: one changed company setting (the service checks the key and value against the registry). */
export class HiringSettingChangeDto {
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
  @MaxLength(100)
  key!: string;

  @IsString()
  @MaxLength(100)
  value!: string;
}

export class SaveHiringSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HiringSettingChangeDto)
  changes!: HiringSettingChangeDto[];
}

/** HIR-23: one category's numbers, as the auditor reported them (no candidate identities). */
export class BiasCategoryDto {
  @IsString() @MaxLength(100) label!: string;
  @IsInt() @Min(0) @Max(10_000_000) assessed!: number;
  @IsInt() @Min(0) @Max(10_000_000) selected!: number;
}

export class BiasResultsDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => BiasCategoryDto) sex!: BiasCategoryDto[];
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => BiasCategoryDto) race!: BiasCategoryDto[];
}

/** HIR-23: record an independent bias audit (the report is a PDF up to 5 MB). */
export class RecordBiasAuditDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'The audit date is YYYY-MM-DD.' }) auditedOn!: string;
  @IsString() @MinLength(2) @MaxLength(200) auditor!: string;
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'The published summary is a web address starting with https://' }) @MaxLength(500) summaryUrl!: string;
  @ValidateNested() @Type(() => BiasResultsDto) results!: BiasResultsDto;
  @IsString() @IsBase64() reportBase64!: string;
  @IsString() @MinLength(1) @MaxLength(200) reportName!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
