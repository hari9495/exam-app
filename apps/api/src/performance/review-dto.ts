import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// Performance batch PM4 request bodies (M06-BUILD-DESIGN §19 "Cycles", "Reviews").

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class StageDto {
  @IsIn(['self', 'manager', 'skip'])
  key!: 'self' | 'manager' | 'skip';

  @Matches(ISO)
  dueOn!: string;

  @IsOptional()
  @IsBoolean()
  optional?: boolean;
}

export class EligibilityRulesDto {
  @IsInt()
  @Min(0)
  @Max(12)
  cutoffMonths!: number;

  @IsBoolean()
  rateLeavers!: boolean;
}

export class CycleDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsIn(['annual', 'half_yearly', 'quarterly', 'project', 'probation'])
  kind!: 'annual' | 'half_yearly' | 'quarterly' | 'project' | 'probation';

  @Matches(ISO)
  periodFrom!: string;

  @Matches(ISO)
  periodTo!: string;

  /** An active template version; the cycle keeps it and its scale (Q3). */
  @IsUUID()
  templateId!: string;

  /** A P19 condition group over the job record; null = everyone in the company. */
  @IsOptional()
  @IsObject()
  population?: Record<string, unknown> | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => StageDto)
  stages!: StageDto[];

  @ValidateNested()
  @Type(() => EligibilityRulesDto)
  eligibilityRules!: EligibilityRulesDto;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class OverrideDto {
  @IsBoolean()
  reviewed!: boolean;

  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ReviewListDto {
  @IsOptional()
  @IsIn(['mine', 'team', 'scope'])
  view?: 'mine' | 'team' | 'scope';

  @IsOptional()
  @IsUUID()
  cycle?: string;
}

export class AnswerDto {
  /** A question, or a rated section with no questions (goals, competencies), which is rated as a whole. */
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  rating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string | null;
}

export class EntryDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  overallRating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string | null;
}
