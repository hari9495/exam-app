import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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

export class TeamMemberDto {
  @IsIn(SPEAKUP_TEAMS)
  team!: SpeakupTeam;

  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsIn(['member', 'presiding', 'external'])
  role?: 'member' | 'presiding' | 'external';
}
