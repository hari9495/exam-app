import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// Performance batch PM4 request bodies (M06-BUILD-DESIGN §19 "Cycles", "Reviews").

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class StageDto {
  @IsIn(['self', 'manager', 'skip'])
  key!: 'self' | 'manager' | 'skip';

  @Matches(ISO)
  dueOn!: string;

  @IsOptional()
  @IsBoolean()
  optional?: boolean;
}

export class EligibilityRulesDto {
  @IsInt()
  @Min(0)
  @Max(12)
  cutoffMonths!: number;

  @IsBoolean()
  rateLeavers!: boolean;
}

export class CycleDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsIn(['annual', 'half_yearly', 'quarterly', 'project', 'probation'])
  kind!: 'annual' | 'half_yearly' | 'quarterly' | 'project' | 'probation';

  @Matches(ISO)
  periodFrom!: string;

  @Matches(ISO)
  periodTo!: string;

  /** An active template version; the cycle keeps it and its scale (Q3). */
  @IsUUID()
  templateId!: string;

  /** A P19 condition group over the job record; null = everyone in the company. */
  @IsOptional()
  @IsObject()
  population?: Record<string, unknown> | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => StageDto)
  stages!: StageDto[];

  @ValidateNested()
  @Type(() => EligibilityRulesDto)
  eligibilityRules!: EligibilityRulesDto;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class OverrideDto {
  @IsBoolean()
  reviewed!: boolean;

  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ReviewListDto {
  @IsOptional()
  @IsIn(['mine', 'team', 'scope'])
  view?: 'mine' | 'team' | 'scope';

  @IsOptional()
  @IsUUID()
  cycle?: string;
}

export class AnswerDto {
  /** A question, or a rated section with no questions (goals, competencies), which is rated as a whole. */
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  rating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string | null;
}

export class EntryDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  overallRating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string | null;
}

export class CommentDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;
}

export class ReasonDto {
  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class DisagreeDto {
  @trim()
  @IsString()
  @Length(3, 2000)
  text!: string;
}

export class DecideDisagreementDto {
  @IsIn(['answered', 'upheld', 'not_upheld'])
  status!: 'answered' | 'upheld' | 'not_upheld';

  @trim()
  @IsString()
  @Length(3, 2000)
  hrNote!: string;
}

export class OtherReviewerDto {
  @IsUUID()
  employeeId!: string;
}

// ------------------------------------------------------------------------------------------ PM5: peer and 360° (§19)

export class PeerConfigDto {
  @IsInt()
  @Min(0)
  @Max(20)
  minNominees!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  maxNominees!: number;

  @Matches(ISO)
  dueOn!: string;
}

export class NominateDto {
  @IsUUID()
  reviewerEmployeeId!: string;

  @IsIn(['peer', 'report', 'other'])
  relationship!: 'peer' | 'report' | 'other';
}

export class NomineeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class BlockDto {
  @IsUUID()
  employeeA!: string;

  @IsUUID()
  employeeB!: string;

  @IsIn(['conflict', 'confidential_matter'])
  reasonCode!: 'conflict' | 'confidential_matter';

  @IsOptional()
  @Matches(ISO)
  untilOn?: string | null;
}

// ------------------------------------------------------------------------------------------ PM6: calibration and reports (§19)

export class GuideBandDto {
  @IsString()
  @Length(1, 60)
  label!: string;

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(100)
  share!: number;
}

export class GuideDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GuideBandDto)
  bands!: GuideBandDto[];

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(50)
  tolerance!: number;
}

export class SessionDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsUUID()
  facilitatorUserId!: string;

  /** Departments whose finished reviews join the session; empty or missing = every finished review of the cycle. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  departmentIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => GuideDto)
  guide?: GuideDto | null;
}

export class CalibrationChangeDto {
  @IsUUID()
  reviewId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  toScore?: number | null;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  toBand?: string | null;

  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ReportQueryDto {
  @IsUUID()
  cycle!: string;
}

// ------------------------------------------------------------------------------------------ PM7: ratings to pay (§19)

export class MatrixCellDto {
  @IsString()
  @Length(1, 60)
  band!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(10)
  compaFrom?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(10)
  compaTo?: number | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  minPct!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  targetPct!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxPct!: number;
}

export class MatrixDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsIn(['compa_ratio', 'rating_only'])
  axis!: 'compa_ratio' | 'rating_only';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MatrixCellDto)
  cells!: MatrixCellDto[];

  @IsOptional()
  @IsInt()
  version?: number;
}

export class BonusDto {
  /** The pay month the bonus is paid in (YYYY-MM). */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  targetPct!: number;

  /** Band label → multiplier (for example Exceeds 1.5). */
  @IsObject()
  multipliers!: Record<string, number>;
}

export class CompCycleDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  reviewCycleId?: string | null;

  @IsUUID()
  legalEntityId!: string;

  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Matches(ISO)
  effectiveOn!: string;

  @IsUUID()
  matrixId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BonusDto)
  bonus?: BonusDto | null;
}

export class BudgetDto {
  @IsUUID()
  departmentId!: string;

  @IsIn(['merit', 'bonus'])
  kind!: 'merit' | 'bonus';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  amount!: number;
}

export class BudgetsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BudgetDto)
  budgets!: BudgetDto[];
}

export class ProposalDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  meritPct!: number;

  @IsOptional()
  @IsUUID()
  promotionToGradeId?: string | null;

  @IsOptional()
  @IsUUID()
  promotionToDesignationId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  promotionAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  bonusAmount?: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  justification?: string | null;

  @IsInt()
  version!: number;
}

export class EquityQueryDto {
  @IsIn(['gender', 'grade', 'location'])
  dimension!: 'gender' | 'grade' | 'location';
}
