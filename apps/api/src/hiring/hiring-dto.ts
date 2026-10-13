import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

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
