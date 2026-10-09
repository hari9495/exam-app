import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// Service Desk batch 4 knowledge inputs (M14 §12.1 /kb/…). Whitelisted by the global ValidationPipe.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};
const HTML_MAX = 200_000;
export const KB_AUDIENCES = ['agents', 'requesters', 'public'] as const;
const LANGS = ['en', 'hi', 'ta', 'te'] as const;

export class KbSpaceDto {
  @IsOptional()
  @IsUUID()
  deskId?: string;

  @Text(1, 100)
  name!: string;

  @Matches(/^[a-z0-9][a-z0-9-]{1,39}$/, { message: 'Use 2 to 40 small letters, digits and dashes' })
  slug!: string;

  @IsIn(KB_AUDIENCES)
  audience!: (typeof KB_AUDIENCES)[number];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(LANGS, { each: true })
  languages?: string[];

  @IsOptional()
  @IsIn(['active', 'off'])
  status?: 'active' | 'off';

  @IsOptional()
  @IsInt()
  version?: number;
}

export class CategoryDto {
  @Text(1, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class IdListDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class KbListQueryDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsIn(['draft', 'in_review', 'published', 'retired'])
  state?: string;

  @IsOptional()
  @Text(1, 100)
  search?: string;

  @IsOptional()
  @IsIn(LANGS)
  language?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  outdated?: boolean;
}

export class ArticleDto {
  @IsUUID()
  spaceId!: string;

  @Text(1, 200)
  title!: string;

  @IsOptional()
  @Text(0, 300)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(HTML_MAX)
  bodyHtml?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(LANGS)
  language?: string;

  @IsOptional()
  @IsUUID()
  translationOfId?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{0,79}$/, { message: 'Use small letters, digits and dashes' })
  slug?: string;

  @IsOptional()
  @Text(0, 300)
  note?: string;
}

export class DraftDto {
  @Text(1, 200)
  title!: string;

  @IsOptional()
  @Text(0, 300)
  summary?: string;

  @IsString()
  @MaxLength(HTML_MAX)
  bodyHtml!: string;

  @IsOptional()
  @Text(0, 300)
  note?: string;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class ArticleMetaDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{0,79}$/, { message: 'Use small letters, digits and dashes' })
  slug?: string;

  @IsOptional()
  @Text(0, 70)
  seoTitle?: string;

  @IsOptional()
  @Text(0, 160)
  seoDescription?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsDateString({ strict: true })
  reviewDueOn?: string | null;

  @IsOptional()
  @IsDateString()
  publishAt?: string | null;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsIn(['flag', 'hide'])
  expiryAction?: 'flag' | 'hide';

  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}

export class VersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class ReviewDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @Text(0, 300)
  note?: string;
}

export class BlockDto {
  @Matches(/^[a-z0-9][a-z0-9-]{1,39}$/, { message: 'Use 2 to 40 small letters, digits and dashes' })
  key!: string;

  @Text(1, 100)
  name!: string;

  @IsString()
  @MaxLength(20_000)
  bodyHtml!: string;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class TemplateDto {
  @Text(1, 100)
  name!: string;

  @IsString()
  @MaxLength(HTML_MAX)
  bodyHtml!: string;
}

export class FlagDto {
  @Text(3, 300)
  reason!: string;
}

export class FollowDto {
  @IsBoolean()
  follow!: boolean;
}

export class KbLinkDto {
  @IsUUID()
  articleId!: string;

  @IsIn(['linked', 'solved'])
  kind!: 'linked' | 'solved';
}

export class FromTicketDto {
  @IsUUID()
  spaceId!: string;
}

export class KbSearchDto {
  @Text(1, 100)
  q!: string;
}

export class KbArticleQueryDto {
  @IsOptional()
  @IsIn(LANGS)
  lang?: string;
}

export class KbFeedbackDto {
  @IsOptional()
  @IsBoolean()
  helpful?: boolean;

  /** "This solved it": counted as self-service (YX-HD-04), no ticket is made. */
  @IsOptional()
  @IsBoolean()
  solved?: boolean;

  @IsOptional()
  @Text(0, 500)
  comment?: string;
}

export class KbClickDto {
  @IsUUID()
  articleId!: string;

  @Text(1, 100)
  q!: string;
}

export class GapTaskDto {
  @IsUUID()
  deskId!: string;

  @Text(1, 150)
  query!: string;

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string;
}

export class PeriodDto {
  @IsDateString({ strict: true })
  from!: string;

  @IsDateString({ strict: true })
  to!: string;
}

export const NumberParam = () => Type(() => Number);
