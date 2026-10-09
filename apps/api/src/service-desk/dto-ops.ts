import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Service Desk batch 4 inputs other than knowledge (M14 §12.1): CSAT / NPS, reports, directory and people, privacy,
// YukthiX support. Whitelisted by the global ValidationPipe (forbidNonWhitelisted).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};

// ---------------------------------------------------------------------------------------------- CSAT / NPS

export class RatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @Text(0, 1000)
  comment?: string;
}

export class LinkAnswerDto {
  @IsInt()
  @Min(0)
  @Max(10)
  score!: number;
}

export class LinkCommentDto {
  @Text(1, 1000)
  comment!: string;
}

export class SurveyDto {
  @IsUUID()
  deskId!: string;

  @Text(1, 100)
  name!: string;

  @Text(1, 300)
  question!: string;

  @IsInt()
  @Min(7)
  @Max(366)
  everyDays!: number;

  /** A person gets at most one NPS survey in this many days. */
  @IsInt()
  @Min(7)
  @Max(366)
  periodDays!: number;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  version?: number;
}

// ---------------------------------------------------------------------------------------------- reports

export class ReportRunDto {
  @IsOptional()
  @IsUUID()
  deskId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';
}

export class KpiQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(366)
  days?: number;
}

export class KpiTargetDto {
  @Matches(/^[a-z_]{2,24}$/)
  metric!: string;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  target!: number;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  amber!: number;
}

export class ReportFiltersDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  deskIds?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['new', 'open', 'pending', 'on_hold', 'solved', 'closed'], { each: true })
  states?: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(4, { each: true })
  priorities?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  categoryIds?: string[];

  /** Raised in the last N days. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  days?: number;
}

export class CustomReportDto {
  @Text(1, 100)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  columns!: string[];

  @IsObject()
  @ValidateNested()
  @Type(() => ReportFiltersDto)
  filters!: ReportFiltersDto;

  @IsOptional()
  @IsBoolean()
  shared?: boolean;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class ScheduleDto {
  @IsIn(['daily', 'weekly', 'monthly'])
  frequency!: 'daily' | 'weekly' | 'monthly';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  recipients!: string[];
}

export class WallboardDto {
  @Text(1, 100)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  deskIds!: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  backlogAlert?: number;
}

export class MonthDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use YYYY-MM' })
  month!: string;
}

// ---------------------------------------------------------------------------------------------- standalone

export class SignUpDto {
  @Text(2, 200)
  company!: string;

  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, { message: 'The company code is 3 to 50 lowercase letters, digits and hyphens' })
  slug!: string;

  @Text(1, 120)
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  challengeToken?: string;
}

export class PersonDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email?: string;

  @Text(1, 100)
  givenName!: string;

  @IsOptional()
  @Text(0, 100)
  familyName?: string;

  @IsOptional()
  @Text(0, 100)
  team?: string;

  @IsOptional()
  @Text(0, 100)
  location?: string;
}

export class PeopleImportDto {
  @IsString()
  @MaxLength(2_000_000)
  csv!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class SearchDto {
  @IsOptional()
  @Text(0, 100)
  search?: string;
}

export class LdapDto {
  @Matches(/^ldaps:\/\/[A-Za-z0-9.-]{1,253}(:\d{1,5})?\/?$/, { message: 'Enter the address like ldaps://dc1.example.com' })
  url!: string;

  @Text(3, 300)
  bindDn!: string;

  /** Blank keeps the saved password. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bindPassword?: string;

  @Text(3, 300)
  baseDn!: string;

  @IsOptional()
  @Text(0, 500)
  @Matches(/^$|^\(.*\)$/, { message: 'An LDAP filter starts with ( and ends with )' })
  filter?: string;
}

export class GroupMapDto {
  @Text(1, 200)
  group!: string;

  @IsUUID()
  deskId!: string;

  @IsIn(['agent', 'lead', 'collaborator'])
  role!: 'agent' | 'lead' | 'collaborator';
}

export class DirectorySourceDto {
  @IsIn(['ldap', 'scim'])
  kind!: 'ldap' | 'scim';

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LdapDto)
  ldap?: LdapDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GroupMapDto)
  groupMap?: GroupMapDto[];

  @IsOptional()
  @IsIn(['hourly', 'daily', 'off'])
  schedule?: 'hourly' | 'daily' | 'off';

  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: 'active' | 'paused';

  @IsOptional()
  @IsInt()
  version?: number;
}

// ---------------------------------------------------------------------------------------------- privacy

export class PrivacyRequestDto {
  @IsIn(['access', 'erasure'])
  kind!: 'access' | 'erasure';

  @IsOptional()
  @Text(0, 500)
  note?: string;
}

export class DecideDto {
  @IsIn(['complete', 'refuse'])
  action!: 'complete' | 'refuse';

  @IsOptional()
  @Text(0, 500)
  note?: string;
}

export class PrivacySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(240)
  retentionMonths?: number | null;

  @IsBoolean()
  legalHold!: boolean;

  @IsInt()
  @Min(1)
  @Max(90)
  binDays!: number;
}

export class StatusQueryDto {
  @IsOptional()
  @IsIn(['open', 'done', 'refused'])
  status?: string;
}

// ---------------------------------------------------------------------------------------------- YukthiX support

export class SupportRaiseDto {
  @Text(1, 200)
  subject!: string;

  @Text(1, 10_000)
  body!: string;

  /** 1 = down for everyone (24×7), 2 = badly hurt, 3 = a question or small problem, 4 = an idea. */
  @IsInt()
  @Min(1)
  @Max(4)
  severity!: number;

  /** The screen the admin was on (a path, never personal data). */
  @IsOptional()
  @Matches(/^\/[A-Za-z0-9/_\-?=&.]{0,199}$/)
  screen?: string;
}

export class SupportReplyDto {
  @Text(1, 10_000)
  body!: string;
}

export class ConsoleQueueDto {
  @IsOptional()
  @IsIn(['open', 'all'])
  state?: 'open' | 'all';
}

export class ConsoleMessageDto {
  @IsIn(['reply', 'note'])
  kind!: 'reply' | 'note';

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  bodyHtml!: string;
}

export class ConsoleResolveDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(0, 2000)
  note?: string;
}

export class ConsoleLinkDto {
  @IsUUID()
  accountId!: string;
}

export class SupportAccessDto {
  @Text(10, 400)
  reason!: string;

  @IsInt()
  @Min(1)
  @Max(72)
  hours!: number;
}
