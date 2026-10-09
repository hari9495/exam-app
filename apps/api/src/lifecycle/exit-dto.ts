import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { COMPANY_EXIT_TYPES, RESIGNATION_REASONS } from './exit-rules';

// Lifecycle batch 6c request bodies (design §13).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

export class ResignDto {
  @IsIn(RESIGNATION_REASONS)
  reasonCode!: (typeof RESIGNATION_REASONS)[number];

  @trim()
  @IsString()
  @Length(3, 1000)
  reasonText!: string;

  @IsOptional()
  @Matches(ISO)
  requestedLwd?: string | null;
}

export class ReasonDto {
  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CompanyExitDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(COMPANY_EXIT_TYPES)
  exitType!: (typeof COMPANY_EXIT_TYPES)[number];

  @Matches(ISO)
  lwd!: string;

  @IsOptional()
  @Matches(/^[a-z_]{1,40}$/)
  reasonCode?: string | null;

  @trim()
  @IsString()
  @Length(3, 1000)
  reasonText!: string;
}

export class NoticeChangeDto {
  @IsIn(['early_release', 'buyout', 'lwd_change'])
  kind!: 'early_release' | 'buyout' | 'lwd_change';

  @Matches(ISO)
  lwd!: string;

  @IsOptional()
  @IsIn(['employee', 'company'])
  buyoutBy?: 'employee' | 'company' | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  buyoutDays?: number | null;

  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;

  @IsInt()
  version!: number;
}

export class HrFactsDto {
  @IsOptional()
  @IsBoolean()
  rehireEligible?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rehireReason?: string | null;

  @IsOptional()
  @IsBoolean()
  regretted?: boolean | null;

  @IsOptional()
  @IsBoolean()
  backfillRequested?: boolean;

  @IsOptional()
  @IsBoolean()
  hold?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  holdReason?: string | null;

  @IsOptional()
  @Matches(ISO)
  holdReviewOn?: string | null;

  @IsInt()
  version!: number;
}

export class ProbationReviewDto {
  @IsIn(['confirm', 'extend', 'terminate'])
  outcome!: 'confirm' | 'extend' | 'terminate';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  months?: number | null;

  @trim()
  @IsString()
  @Length(3, 2000)
  comments!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number | null;
}

export class SignOffDto {
  @IsIn(['clear', 'waive'])
  action!: 'clear' | 'waive';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @Matches(MONEY)
  recoveryAmount?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  recoveryReason?: string | null;

  @IsInt()
  version!: number;
}

export class InterviewDto {
  @IsObject()
  answers!: Record<string, unknown>;
}

export class InterviewNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class AssetDto {
  @trim()
  @IsString()
  @Length(1, 40)
  category!: string;

  @trim()
  @IsString()
  @Length(1, 150)
  name!: string;

  @trim()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$/, { message: 'tag uses letters, digits, dot, dash, slash or underscore' })
  tag!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serial?: string | null;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @Matches(ISO)
  purchasedOn?: string | null;

  @IsOptional()
  @Matches(MONEY)
  cost?: string | null;

  @IsOptional()
  @IsIn(['in_stock', 'in_repair', 'retired', 'lost'])
  status?: 'in_stock' | 'in_repair' | 'retired' | 'lost';

  @IsOptional()
  @IsInt()
  version?: number;
}

export class IssueAssetDto {
  @IsUUID()
  employeeId!: string;

  @Matches(ISO)
  issuedOn!: string;

  @trim()
  @IsString()
  @Length(2, 200)
  condition!: string;
}

export class ReturnAssetDto {
  @Matches(ISO)
  returnedOn!: string;

  @trim()
  @IsString()
  @Length(2, 200)
  condition!: string;

  @IsIn(['in_stock', 'in_repair', 'lost'])
  status!: 'in_stock' | 'in_repair' | 'lost';
}
