import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// Performance batch PM1 request bodies (M06-BUILD-DESIGN §19 "Set-up").

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class LevelDto {
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(100)
  value!: number;

  @trim()
  @IsString()
  @Length(1, 60)
  label!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  description?: string | null;
}

export class BandDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  fromScore!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  toScore!: number;

  @trim()
  @IsString()
  @Length(1, 60)
  label!: string;
}

export class ScaleDto {
  @trim()
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  min!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  max!: number;

  @IsIn([1, 0.5])
  step!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(41)
  @ValidateNested({ each: true })
  @Type(() => LevelDto)
  levels!: LevelDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BandDto)
  bands!: BandDto[];

  @IsOptional()
  @IsInt()
  version?: number;
}

export class QuestionDto {
  @trim()
  @IsString()
  @Length(3, 500)
  text!: string;

  @IsIn(['rating', 'text', 'both'])
  answer!: 'rating' | 'text' | 'both';

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class SectionDto {
  @IsIn(['goals', 'competencies', 'values', 'questions', 'overall'])
  kind!: 'goals' | 'competencies' | 'values' | 'questions' | 'overall';

  @trim()
  @IsString()
  @Length(2, 100)
  title!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight!: number;

  @IsBoolean()
  rated!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['self', 'manager', 'peer', 'skip'], { each: true })
  whoAnswers!: ('self' | 'manager' | 'peer' | 'skip')[];

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
}

export class TemplateDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsIn(['annual', 'half_yearly', 'quarterly', 'project', 'probation'])
  kind!: 'annual' | 'half_yearly' | 'quarterly' | 'project' | 'probation';

  @IsUUID()
  scaleId!: string;

  @IsIn(['weighted', 'manager_overall'])
  scoring!: 'weighted' | 'manager_overall';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => SectionDto)
  sections!: SectionDto[];

  @IsOptional()
  @IsInt()
  version?: number;
}

export class VersionDto {
  @IsInt()
  version!: number;
}

export class RoleLevelDto {
  @IsUUID()
  designationId!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  level!: number;

  @Matches(ISO)
  validFrom!: string;
}

export class CompetencyDto {
  @trim()
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsIn(['core', 'functional', 'leadership'])
  group!: 'core' | 'functional' | 'leadership';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CompetencyLevelDto)
  levels!: CompetencyLevelDto[];

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RoleLevelDto)
  roles!: RoleLevelDto[];

  @IsOptional()
  @IsInt()
  version?: number;
}

export class CompetencyLevelDto {
  @trim()
  @IsString()
  @Length(2, 80)
  label!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  behaviours?: string | null;
}

export class SkillDto {
  @trim()
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsIn(['domain', 'skill', 'sub_skill'])
  kind!: 'domain' | 'skill' | 'sub_skill';

  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class MergeDto {
  @IsUUID()
  intoId!: string;
}
