import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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

  /** Retrenchment (YX-LC-27). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  selectionBasis?: string | null;

  @IsOptional()
  @IsIn(['notice', 'pay_in_lieu'])
  noticeMode?: 'notice' | 'pay_in_lieu' | null;

  @IsOptional()
  @IsUUID()
  irPermissionId?: string | null;
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

export class ManualStepDto {
  @trim()
  @IsString()
  @Length(3, 500)
  note!: string;
}

export class SettledOutsideDto {
  @Matches(ISO)
  settledOn!: string;

  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}

// ---- Lifecycle batch 6e ----

export class RehireDto {
  @IsObject()
  overrides!: Record<string, { value: string; reason?: string | null }>;

  @IsInt()
  version!: number;
}

export class BuddyDto {
  @IsOptional()
  @IsUUID()
  employeeId!: string | null;

  @IsInt()
  version!: number;
}

export class TouchpointDto {
  @trim()
  @IsString()
  @Length(2, 120)
  title!: string;

  @Matches(ISO)
  on!: string;
}

export class BatchDto {
  @trim()
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsUUID()
  legalEntityId!: string;

  @Matches(ISO)
  joiningOn!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TouchpointDto)
  touchpoints?: TouchpointDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class BatchMembersDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  preboardingIds!: string[];
}

export class PayeeDto {
  @IsIn(['nominee', 'legal_heir'])
  kind!: 'nominee' | 'legal_heir';

  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @trim()
  @IsString()
  @Length(2, 40)
  relation!: string;

  @Matches(MONEY)
  sharePercent!: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsUUID()
  documentId?: string | null;
}

export class PayeesDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PayeeDto)
  payees!: PayeeDto[];
}

export class AbscondingDto {
  @IsUUID()
  employeeId!: string;

  @Matches(ISO)
  lastPresentOn!: string;
}

export class StopDto {
  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;

  @IsInt()
  version!: number;
}

export class VersionDto {
  @IsInt()
  version!: number;
}

export class DispatchDto {
  @trim()
  @IsString()
  @Length(3, 60)
  ref!: string;

  @IsInt()
  version!: number;
}

export class ContractDto {
  @IsIn(['set', 'extend', 'convert'])
  action!: 'set' | 'extend' | 'convert';

  @IsOptional()
  @Matches(ISO)
  contractEndOn?: string | null;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string | null;

  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class IrPermissionDto {
  @IsUUID()
  legalEntityId!: string;

  @IsIn(['retrenchment', 'layoff', 'closure'])
  kind!: 'retrenchment' | 'layoff' | 'closure';

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  workersAffected!: number;

  @trim()
  @IsString()
  @Length(3, 2000)
  reasons!: string;

  @Matches(ISO)
  appliedOn!: string;

  @trim()
  @IsString()
  @Length(2, 200)
  authority!: string;
}

export class IrDecisionDto {
  @IsIn(['granted', 'deemed', 'refused'])
  status!: 'granted' | 'deemed' | 'refused';

  @Matches(ISO)
  decidedOn!: string;

  @IsOptional()
  @IsUUID()
  orderDocumentId?: string | null;

  @IsInt()
  version!: number;
}

export class ClosureDto {
  @Matches(ISO)
  lwd!: string;

  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class VrsSchemeDto {
  @trim()
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @Matches(ISO)
  opensOn!: string;

  @Matches(ISO)
  closesOn!: string;

  @IsInt()
  @Min(18)
  @Max(70)
  minAge!: number;

  @IsInt()
  @Min(0)
  @Max(45)
  minServiceYears!: number;
}

export class VrsApplyDto {
  @IsUUID()
  schemeId!: string;

  @Matches(ISO)
  requestedLwd!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reasonText?: string | null;
}
