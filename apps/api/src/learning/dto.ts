import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Batch G3a (M07) Learning inputs. Whitelisted by the global ValidationPipe (unknown fields are refused).
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CourseSkillDto {
  @IsUUID()
  skillId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  level!: number;
}

/** An item kept from the builder: its id (existing) with title, required and order; links carry their url. */
export class CourseItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsIn(['video', 'pdf', 'link'])
  kind!: 'video' | 'pdf' | 'link';

  /** Links only: https. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(/^https:\/\/[^\s]+$/, { message: 'A link must start with https://.' })
  url?: string;

  @IsInt()
  @Min(1)
  @Max(600)
  minutes!: number;

  @IsBoolean()
  required!: boolean;
}

export class CourseDto {
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsIn(['self_paced', 'classroom', 'virtual'])
  type!: 'self_paced' | 'classroom' | 'virtual';

  @IsInt()
  @Min(1)
  @Max(100000)
  durationMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(100000000)
  cost!: number;

  @IsBoolean()
  mandatory!: boolean;

  @IsBoolean()
  needsApproval!: boolean;

  @IsBoolean()
  certificate!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  validMonths?: number;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CourseSkillDto)
  skills!: CourseSkillDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CourseItemDto)
  items!: CourseItemDto[];
}

export class FileItemDto {
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  minutes!: number;
}

export class NominateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  userIds!: string[];

  @IsOptional()
  @IsDateString({ strict: true })
  dueOn?: string;
}

export class DeclineDto {
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class DecideDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class PeopleQueryDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  q?: string;
}
