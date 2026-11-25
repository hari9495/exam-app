import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

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
