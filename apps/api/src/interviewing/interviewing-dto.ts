import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsISO8601, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
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

  // Founder answer 345: whole per cent; a template's weights add up to 100 (checked by the service).
  @IsInt()
  @Min(1)
  @Max(100)
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

  /** HIR-04: the status the card showed; a different one now means the card was out of date (409). */
  @IsOptional()
  @IsUUID()
  fromStatusId?: string;
}

/** One rejection from the board (HIR-04): the card's status guards against a stale card. */
export class BoardRejectDto extends RejectDto {
  @IsOptional()
  @IsUUID()
  fromStatusId?: string;
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

/** HIR-06: the interview calendar's range; the service refuses more than 62 days at once. */
export class InterviewRangeDto {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;
}

/** HIR-07 answer 322: one comment under a submitted scorecard (plain text, append-only). */
export class ScorecardCommentDto {
  @trim()
  @IsString()
  @MinLength(1, { message: 'Write a comment before you post it.' })
  @MaxLength(2000, { message: 'Keep the comment under 2,000 characters.' })
  body!: string;

  @IsOptional()
  @IsUUID('4')
  requestId?: string;
}

// HIR-27 bulk interview day.
export class InterviewDayPanelDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  room!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  memberUserIds!: string[];
}

export class InterviewDayDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsUUID()
  jobId!: string;

  @IsUUID()
  stageId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  day!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(1439, { each: true })
  slots!: number[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => InterviewDayPanelDto)
  panels!: InterviewDayPanelDto[];
}

/** HIR-25: a participant's answer to the notetaker ("me" = the panellist themselves; "candidate" = recorded for them). */
export class NotetakerConsentDto {
  @IsIn(['me', 'candidate'])
  participant!: 'me' | 'candidate';

  @IsIn(['given', 'declined'])
  consent!: 'given' | 'declined';
}

/** HIR-25: the transcript a panellist adds while no recording provider is connected (plain text, up to 200,000 characters). */
export class NotetakerTranscriptDto {
  @IsString()
  @MaxLength(200_000)
  text!: string;
}

/** Answer 422: two unsent candidates of a day change places. */
export class DaySwapDto {
  @IsUUID() a!: string;
  @IsUUID() b!: string;
}

/** Answer 421: the day's WhatsApp reminder switch. */
export class DayRemindersDto {
  @IsBoolean() on!: boolean;
}

