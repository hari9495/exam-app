import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Batch G2 item 74: one survey question. */
export class SurveyQuestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  id!: string;

  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  text!: string;

  @IsIn(['enps', 'rating', 'single', 'multiple', 'text'])
  kind!: 'enps' | 'rating' | 'single' | 'multiple' | 'text';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  options?: string[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  theme?: string;
}

export class SurveyDto {
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  name!: string;

  @IsIn(['engagement', 'pulse', 'enps', 'onboarding', 'exit'])
  type!: 'engagement' | 'pulse' | 'enps' | 'onboarding' | 'exit';

  @IsBoolean()
  anonymous!: boolean;

  @IsInt()
  @Min(3)
  @Max(10)
  minGroup!: number;

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => SurveyQuestionDto)
  questions!: SurveyQuestionDto[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  locationIds!: string[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  departmentIds!: string[];

  /** T2-G 42: the company's groups (any of them). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];

  @IsDateString({ strict: true })
  opensOn!: string;

  @IsDateString({ strict: true })
  closesOn!: string;

  @IsBoolean()
  remind!: boolean;

  /** Answer 2664: repeat every month or quarter (each run its own survey). */
  @IsOptional()
  @IsIn(['none', 'monthly', 'quarterly'])
  repeat?: 'none' | 'monthly' | 'quarterly';

  /** Answer 2664: onboarding and exit surveys invite people as they reach the event. */
  @IsOptional()
  @IsBoolean()
  autoInvite?: boolean;

  /** Onboarding: days after joining (0 to 365). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  autoAfterDays?: number;
}

export class AnswersDto {
  @IsObject()
  answers!: Record<string, string | number | string[]>;
}

export class ActionItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  id!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  action!: string;

  @IsDateString({ strict: true })
  dueOn!: string;

  @IsBoolean()
  done!: boolean;
}

export class ActionPlanDto {
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  focus!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  focusScore?: string;

  @IsIn(['draft', 'shared', 'completed'])
  status!: 'draft' | 'shared' | 'completed';

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ActionItemDto)
  items!: ActionItemDto[];
}

export class ResultsQueryDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

/** Batch G2 item 75: a vote on a poll (the option's place, 0 to 4). */
export class VoteDto {
  @IsInt()
  @Min(0)
  @Max(4)
  option!: number;
}

/** Batch G2 item 76: my own celebration choices. */
export class CelebrationPrefsDto {
  @IsBoolean()
  birthday!: boolean;

  @IsBoolean()
  anniversary!: boolean;

  @IsBoolean()
  newJoiner!: boolean;
}

/** Batch G2 item 100: an update to a space. */
export class PostDto {
  @IsUUID()
  spaceId!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  body!: string;

  /** Batch G2 item 75: a poll asks the body as its question, with 2 to 5 options, closing on a day. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  options?: string[];

  @IsOptional()
  @IsDateString({ strict: true })
  closesOn?: string;
}

/** Batch G2 item 73: thank 1 to 20 colleagues for a company value, with an optional badge. */
export class KudosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  to!: string[];

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  value!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  badge?: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;
}

export class KudosQueryDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  value?: string;
}

export class PeopleQueryDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class CommentDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class FeedQueryDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class ModerateDto {
  @IsIn(['approve', 'restore', 'hide', 'delete', 'warn'])
  action!: 'approve' | 'restore' | 'hide' | 'delete' | 'warn';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SpaceApprovalDto {
  @IsBoolean()
  approval!: boolean;
}

/** Batch G2 item 12: who an announcement goes to (both empty = everyone). */
export class AudienceDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  locationIds!: string[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  departmentIds!: string[];

  /** T2-G 42 (answer 2745): the company's groups (any of them), together with the location and department lists. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class AnnouncementDto extends AudienceDto {
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;

  /** Also by email (the title and a link only). In-app is always on. */
  @IsBoolean()
  email!: boolean;

  @IsBoolean()
  ackRequired!: boolean;

  @IsOptional()
  @IsDateString({ strict: true })
  ackDueOn?: string;

  @IsBoolean()
  pinned!: boolean;

  /** Later publishing (an ISO time); left out to publish now. */
  @IsOptional()
  @IsDateString()
  publishAt?: string;
}
