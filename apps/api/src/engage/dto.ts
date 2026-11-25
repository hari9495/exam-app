import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Batch G2 item 100: an update to a space. */
export class PostDto {
  @IsUUID()
  spaceId!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  body!: string;
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
