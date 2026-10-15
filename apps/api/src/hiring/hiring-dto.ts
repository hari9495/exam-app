import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Recruitment batch AT2 request bodies (M10-BUILD-DESIGN §18.1).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class PlanLineDto {
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

  @IsOptional()
  @IsDateString({ strict: true })
  period?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
