import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** The H-1 pages link: app addresses such as /yx/time/leave (the page and every page under it). */
const PAGE = /^\/yx(\/[a-z0-9-]+)+$/;

/** YX-11: a new help article in the YukthiX help space. */
export class HelpArticleDto {
  @trim() @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsOptional() @trim() @IsString() @MaxLength(300) summary?: string;
  @IsString() @MaxLength(200_000) bodyHtml!: string;
  @IsArray() @ArrayMinSize(1, { message: 'Name at least one page it explains.' }) @ArrayMaxSize(20) @Matches(PAGE, { each: true, message: 'Pages are app addresses such as /yx/time/leave.' }) pages!: string[];
  /** Answer 2116: Ask YukthiX may answer from this article (on unless a writer switches it off). */
  @IsOptional() @IsBoolean() assistantUse?: boolean;
}

/** Save the working draft (the version saved last, to catch a newer save) and its pages. */
export class HelpSaveDto extends HelpArticleDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) draftVersion?: number;
}

/** Publish or send back a version someone else wrote. */
export class HelpReviewDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsBoolean() approve!: boolean;
  @IsOptional() @trim() @IsString() @MaxLength(300) note?: string;
}

export class HelpSubmitDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}

/** Answer 1203: why the article is retired (kept in the audit log). */
export class HelpRetireDto {
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
