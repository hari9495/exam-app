import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { RECOMMENDATIONS } from './scorecard-rules';

// Recruitment batch AT5 request bodies (M10-BUILD-DESIGN §18.1).
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class ScorecardItemDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  guidance?: string | null;

  @IsInt()
  @Min(1)
  @Max(10)
  weight!: number;

  @IsOptional()
  @IsUUID()
  competencyId?: string | null;
}

export class ScorecardTemplateDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(3)
  @Max(10)
  scaleMax!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10)
  passBar!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ScorecardItemDto)
  items!: ScorecardItemDto[];
}

export class RatingDto {
  @IsUUID()
  itemId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

export class ScorecardDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RatingDto)
  ratings!: RatingDto[];

  @IsOptional()
  @IsIn(RECOMMENDATIONS as unknown as string[])
  recommendation?: (typeof RECOMMENDATIONS)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  summary?: string | null;
}

export class RejectMessageDto {
  @IsOptional()
  @IsUUID()
  templateId?: string | null;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;
}

export class RejectDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RejectMessageDto)
  message?: RejectMessageDto;

  /** 0 sends the message now; 24 (the default) waits so the rejection can be undone. */
  @IsOptional()
  @IsIn([0, 24])
  delayHours?: 0 | 24;
}

export class MoveDto {
  @IsUUID()
  statusId!: string;
}

export class BulkBoardDto extends RejectDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  entryIds!: string[];

  @IsIn(['move', 'reject', 'assessment'])
  action!: 'move' | 'reject' | 'assessment';

  @IsOptional()
  @IsUUID()
  statusId?: string;

  @IsOptional()
  @IsUUID()
  examId?: string;
}

export class JobScorecardDto {
  @IsOptional()
  @IsUUID()
  templateId!: string | null;
}

export class SendOnStageDto {
  @IsOptional()
  @IsUUID()
  stageId!: string | null;
}
