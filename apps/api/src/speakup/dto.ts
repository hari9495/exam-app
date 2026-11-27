import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

// HLP-06 speak-up inputs. Whitelisted by the global ValidationPipe (unknown fields are refused).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};
const Opt = (max: number) => (target: object, key: string) => {
  IsOptional()(target, key);
  Text(0, max)(target, key);
};
export const SPEAKUP_KINDS = ['grievance', 'whistleblower', 'posh'] as const;
export type SpeakupKind = (typeof SPEAKUP_KINDS)[number];
// 'safety' (HLP-12): the safety team who receives accident reports; 'ir' (HLP-13): the industrial relations team who
// keeps collective disputes (an outside lawyer joins as 'external'). Neither is a speak-up route.
export const SPEAKUP_TEAMS = ['grievance', 'ethics', 'ic', 'escalation', 'safety', 'ir'] as const;
export type SpeakupTeam = (typeof SPEAKUP_TEAMS)[number];

export class ReportDto {
  @IsIn(SPEAKUP_KINDS)
  kind!: SpeakupKind;

  @Opt(80)
  category?: string;

  @Text(10, 10_000)
  summary!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  happenedOn?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @Opt(300)
  involved?: string;

  @Opt(150)
  outsideName?: string;

  @Opt(150)
  outsideEmployer?: string;

  @Opt(300)
  witnesses?: string;

  @IsOptional()
  @IsBoolean()
  retaliationWorry?: boolean;

  /** "It is about someone on the case team": that officer never sees it; it goes to the escalation list. */
  @IsOptional()
  @IsUUID()
  aboutUserId?: string;

  /** Answer 2597 (POSH only): filed on her behalf: her name and the filer's relationship to her (both or neither). */
  @Opt(150)
  onBehalfName?: string;

  @Opt(100)
  onBehalfRelation?: string;

  /** Answer 2597 (POSH only): why it was not filed within the window. */
  @Opt(1000)
  lateReason?: string;

  /** Answer 2597 (POSH only): she asks to try conciliation first (never a money settlement). */
  @IsOptional()
  @IsBoolean()
  conciliation?: boolean;
}

/** Batch G1 answer 2593: an awareness session the Internal Committee held. */
export class AwarenessSessionDto {
  /** The workplace committee; left out for the company committee. */
  @IsOptional()
  @IsUUID()
  committeeId?: string;

  @IsDateString({ strict: true })
  heldOn!: string;

  @Text(3, 200)
  title!: string;

  @Opt(200)
  audience?: string;

  @IsInt()
  @Min(0)
  @Max(100000)
  attended!: number;
}

/** Batch G1 answer 2593: the presiding officer moves the annual report on (reviewed, sent to the employer, the District Officer). */
export class AnnualReportStepDto {
  @IsOptional()
  @IsUUID()
  committeeId?: string;

  @IsInt()
  @Min(2013)
  @Max(2100)
  year!: number;

  @IsIn(['reviewed', 'employer', 'district'])
  step!: 'reviewed' | 'employer' | 'district';

  /** With "reviewed": the action taken in the year (for example "1 transfer, 1 written warning"). */
  @Opt(1000)
  actionTaken?: string;
}

/** Anonymous filing through the no-login route: the company by its sign-in name. POSH is never anonymous. */
export class AnonymousReportDto extends ReportDto {
  @Text(1, 80)
  org!: string;

  /** HLP-06 decision 1: where to say "You have an update". Stored encrypted; nobody at the company can read it. */
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  alertEmail?: string;
}

export class CodeDto {
  @Text(1, 80)
  org!: string;

  /** The reply code as printed (dashes and spaces are ignored). */
  @Text(1, 40)
  code!: string;
}

export class ReplyDto extends CodeDto {
  @Text(1, 5_000)
  body!: string;
}

export class TeamReplyDto {
  @Text(1, 5_000)
  body!: string;
}

/** Answer 2625: change a member on a list (Internal Committee: role, woman, term end; IR team: company or outside lawyer). */
export class EditMemberDto {
  @IsOptional()
  @IsIn(['member', 'presiding', 'external'])
  role?: 'member' | 'presiding' | 'external';

  @IsOptional()
  @IsBoolean()
  woman?: boolean;

  @IsOptional()
  @IsDateString({ strict: true })
  termEndsOn?: string;
}

export class TeamMemberDto {
  @IsIn(SPEAKUP_TEAMS)
  team!: SpeakupTeam;

  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsIn(['member', 'presiding', 'external'])
  role?: 'member' | 'presiding' | 'external';

  /** Answer 2591: Internal Committee only, and required there. */
  @IsOptional()
  @IsBoolean()
  woman?: boolean;

  @IsOptional()
  @IsDateString({ strict: true })
  termEndsOn?: string;

  /** Answer 2592: a workplace's own committee (Internal Committee only); left out for the company committee. */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

/** Answer 2621: which committee's annual report (none: the whole company's) and the year. */
export class AnnualReportPdfQueryDto {
  @IsOptional()
  @IsUUID()
  committeeId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(2013)
  @Max(2100)
  year!: number;
}
