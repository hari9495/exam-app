import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { FINDINGS, MEMBER_ROLES, RELIEF_ACTIONS, SEVERITIES, type Finding, type ReliefAction, type Severity } from './case-rules';

// HLP-07/08/09 case inputs. Whitelisted by the global ValidationPipe (unknown fields are refused).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};
const Version = () => (target: object, key: string) => {
  Type(() => Number)(target, key);
  IsInt()(target, key);
  Min(1)(target, key);
};
const Ids = () => (target: object, key: string) => {
  IsOptional()(target, key);
  IsArray()(target, key);
  ArrayMaxSize(10)(target, key);
  IsUUID('all', { each: true })(target, key);
};

export class MessageDto {
  @Text(2, 5_000)
  body!: string;
}

export class NoticeDto {
  /** Required when the case has no respondent yet. */
  @IsOptional()
  @IsUUID()
  respondentUserId?: string;

  @Text(10, 5_000)
  allegations!: string;

  /** Case files shared with the respondent (the copy of the complaint and papers). */
  @Ids()
  fileIds?: string[];
}

export class DelayDto {
  @Text(3, 500)
  reason!: string;

  @IsDateString({ strict: true })
  reviewOn!: string;
}

export class MoreTimeDecisionDto {
  @IsBoolean()
  grant!: boolean;

  @IsOptional()
  @IsDateString({ strict: true })
  newDue?: string;
}

export class ProposeDto {
  @IsIn(FINDINGS)
  finding!: Finding;

  @Text(3, 500)
  action!: string;

  @Text(20, 5_000)
  reasons!: string;

  /** What the reporter (and the respondent) are told once a second officer approves. */
  @Text(3, 1_000)
  reporterSummary!: string;

  @Version()
  version!: number;
}

export class VersionDto {
  @Version()
  version!: number;
}

export class SendBackDto extends VersionDto {
  @Text(3, 500)
  note!: string;
}

export class IcReportDto {
  @IsIn(FINDINGS)
  finding!: Finding;

  @Text(20, 5_000)
  findings!: string;

  @Text(3, 2_000)
  recommendation!: string;

  @Version()
  version!: number;
}

export class VoteDto {
  @IsIn(['agree', 'disagree'])
  vote!: 'agree' | 'disagree';

  @IsOptional()
  @Text(0, 1_000)
  note?: string;
}

export class ReliefDto {
  @IsIn(RELIEF_ACTIONS)
  action!: ReliefAction;

  @Text(3, 1_000)
  note!: string;

  /** The person in HR who carries it out. */
  @IsUUID()
  assigneeUserId!: string;
}

export class SeverityDto {
  @IsIn(SEVERITIES)
  severity!: Severity;
}

export class ReasonDto {
  @Text(3, 500)
  reason!: string;
}

export class AddMemberDto {
  @IsUUID()
  personId!: string;

  @IsIn(MEMBER_ROLES)
  role!: (typeof MEMBER_ROLES)[number];

  @IsOptional()
  @Text(3, 500)
  overrideReason?: string;
}

export class ReplyDto {
  @Text(3, 5_000)
  text!: string;

  @Ids()
  fileIds?: string[];
}
