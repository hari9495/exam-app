import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Batch 5i DTOs (M03-BUILD-DESIGN §14.7): special pay (piece-rate, incentives, tips, on-call, union dues, settlements,
// lay-off, VRS) sent to payroll as postings.
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const QTY = /^\d{1,9}(\.\d{1,3})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class EntityMonthQuery {
  @IsUUID()
  legalEntityId!: string;

  @IsOptional()
  @Matches(MONTH)
  month?: string;
}

export class PostMonthDto {
  @IsUUID()
  legalEntityId!: string;

  @Matches(MONTH)
  month!: string;
}

// ------------------------------------------------------------------------------------------ piece-rate

export class RateCardDto {
  @IsUUID()
  legalEntityId!: string;

  @upper()
  @Matches(/^[A-Z0-9_-]{1,30}$/, { message: 'An operation code is up to 30 letters, digits, _ or -.' })
  operationCode!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @Matches(/^\d{1,8}(\.\d{1,4})?$/, { message: 'The rate per unit, like 2.50.' })
  rate!: string;

  @Matches(DAY)
  validFrom!: string;
}

export class OutputRowDto {
  @IsUUID()
  employeeId!: string;

  @Matches(DAY)
  workDate!: string;

  @upper()
  @Matches(/^[A-Z0-9_-]{1,30}$/)
  operationCode!: string;

  @Matches(QTY, { message: 'The quantity, up to 3 decimals.' })
  quantity!: string;
}

export class OutputsDto {
  @IsUUID()
  legalEntityId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => OutputRowDto)
  rows!: OutputRowDto[];
}

export class OutputImportDto {
  @IsUUID()
  legalEntityId!: string;
}

// ------------------------------------------------------------------------------------------ incentives

export class TierDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  from!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  multiplier!: number;
}

export class IncentivePlanDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsIn(['production', 'attendance', 'sales'])
  kind!: 'production' | 'attendance' | 'sales';

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  metric!: string;

  @Matches(MONEY)
  targetAmount!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TierDto)
  tiers!: TierDto[];

  @IsOptional()
  @Matches(/^\d{1,4}(\.\d{1,2})?$/)
  capPercent?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(730)
  clawbackDays!: number;
}

export class ResultRowDto {
  @IsUUID()
  employeeId!: string;

  @Matches(MONEY)
  quota!: string;

  @Matches(MONEY)
  actual!: string;
}

export class IncentiveResultsDto {
  @Matches(MONTH)
  month!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ResultRowDto)
  rows!: ResultRowDto[];
}

export class ClawbackDto {
  @IsUUID()
  resultId!: string;

  @Matches(MONEY)
  amount!: string;

  @Matches(MONTH)
  month!: string;

  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

// ------------------------------------------------------------------------------------------ tips and on-call

export class TipShareDto {
  @IsUUID()
  employeeId!: string;

  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  basis!: string;
}

export class TipPoolDto {
  @IsUUID()
  locationId!: string;

  @Matches(MONTH)
  month!: string;

  @Matches(MONEY)
  amount!: string;

  @IsIn(['points', 'hours', 'shifts'])
  method!: 'points' | 'hours' | 'shifts';

  @IsBoolean()
  paidDirect!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => TipShareDto)
  shares!: TipShareDto[];
}

export class OncallRuleDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Matches(MONEY)
  standbyAmount!: string;

  @Matches(/^\d{1,2}(\.\d{1,2})?$/)
  calloutMinHours!: string;

  @Matches(MONEY)
  calloutRate!: string;

  @Matches(/^\d(\.\d{1,2})?$/)
  multiplier!: string;
}

export class OncallSlotDto {
  @IsUUID()
  ruleId!: string;

  @IsUUID()
  employeeId!: string;

  @Matches(DAY)
  slotDate!: string;

  @IsOptional()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/)
  calloutHours?: string;
}

// ------------------------------------------------------------------------------------------ industrial relations

export class UnionDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  registrationNo?: string;
}

export class AuthorisationDto {
  @IsUUID()
  unionId!: string;

  @IsUUID()
  employeeId!: string;

  @IsIn(['fixed', 'percent'])
  duesKind!: 'fixed' | 'percent';

  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  duesValue!: string;

  @Matches(DAY)
  validFrom!: string;
}

export class RevokeDto {
  @Matches(DAY)
  revokedOn!: string;
}

export class SettlementRateDto {
  @trim()
  @Matches(/^[a-z_]{2,16}$/, { message: 'A worker category (skill class), like skilled.' })
  category!: string;

  @Matches(MONEY)
  monthlyIncrease!: string;
}

export class SettlementDto {
  @IsUUID()
  legalEntityId!: string;

  @IsOptional()
  @IsUUID()
  unionId?: string;

  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @Matches(DAY)
  effectiveFrom!: string;

  @Matches(DAY)
  signedOn!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SettlementRateDto)
  rates!: SettlementRateDto[];
}

export class SettlementPostDto {
  @Matches(MONTH)
  month!: string;
}

export class LayoffDto {
  @IsUUID()
  employeeId!: string;

  @Matches(MONTH)
  month!: string;

  @Matches(/^\d{1,2}(\.5)?$/, { message: 'Lay-off days in whole or half days.' })
  days!: string;
}

export class VrsDto {
  @IsUUID()
  employeeId!: string;

  @Matches(MONTH)
  month!: string;

  @Matches(MONEY)
  amount!: string;

  /** VRS exemption claimed before (any employer), from the person's declaration. */
  @Matches(MONEY)
  priorExemption!: string;
}

// ------------------------------------------------------------------------------------------ earned wage access

export class EwaPolicyDto {
  @IsUUID()
  legalEntityId!: string;

  @Matches(DAY)
  validFrom!: string;

  @IsBoolean()
  enabled!: boolean;

  @Matches(/^\d{1,3}(\.\d{1,2})?$/)
  percentAvailable!: string;

  @Matches(MONEY)
  minAmount!: string;

  @Matches(MONEY)
  maxAmount!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  drawsPerMonth!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(15)
  blackoutDays!: number;

  @Matches(MONEY)
  fee!: string;

  @IsIn(['employee', 'employer'])
  feePayer!: 'employee' | 'employer';
}

export class EwaDrawDto {
  @Matches(MONEY)
  amount!: string;

  /** The person saw the amount, the fee and the recovery and agreed (YX-PAY-40). */
  @IsBoolean()
  acceptDisclosure!: boolean;
}

export class EwaPaidDto {
  @trim()
  @Matches(/^[A-Za-z0-9/-]{4,60}$/, { message: 'The bank reference of the payment.' })
  reference!: string;
}

export class ReasonDto {
  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

// ------------------------------------------------------------------------------------------ equity

export class EquityPlanDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsIn(['ESOP', 'RSU', 'SAR'])
  kind!: 'ESOP' | 'RSU' | 'SAR';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  poolUnits!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  exitWindowDays!: number;
}

export class ValuationDto {
  @IsUUID()
  legalEntityId!: string;

  @Matches(DAY)
  valuedOn!: string;

  @Matches(/^\d{1,10}(\.\d{1,4})?$/)
  fmv!: string;

  @IsIn(['listed_price', 'merchant_banker'])
  basis!: 'listed_price' | 'merchant_banker';
}

export class MilestoneDto {
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  milestone!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  units!: number;
}

export class GrantDto {
  @IsUUID()
  planId!: string;

  @IsUUID()
  employeeId!: string;

  @Matches(DAY)
  grantedOn!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  units!: number;

  @Matches(/^\d{1,10}(\.\d{1,4})?$/)
  exercisePrice!: string;

  /** Time vesting: a cliff, then equal parts every few months until the end (units not covered by milestones). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  cliffMonths!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  vestingMonths!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  everyMonths!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];
}

export class ExerciseDto {
  @IsUUID()
  grantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  units!: number;
}

// ------------------------------------------------------------------------------------------ actuarial and country packs

export class CensusDto {
  @IsUUID()
  legalEntityId!: string;

  @Matches(DAY)
  asOf!: string;

  @IsIn(['IND_AS_19', 'AS_15'])
  standard!: 'IND_AS_19' | 'AS_15';
}

export class ValuationResultDto extends CensusDto {
  @IsIn(['gratuity', 'leave'])
  kind!: 'gratuity' | 'leave';

  @IsOptional()
  @IsUUID()
  censusId?: string;

  @Matches(/^\d{1,13}(\.\d{1,2})?$/)
  closing!: string;
}

export class PackSwitchDto {
  @IsUUID()
  legalEntityId!: string;

  /** The pack's set-up values (UAE: the employer establishment id and the agent's routing code). */
  @IsOptional()
  @IsObject()
  settings?: Record<string, string>;
}

export class WpsIdsDto {
  @IsUUID()
  employeeId!: string;

  @Matches(/^\d{14}$/, { message: 'The person id from the labour card is 14 digits.' })
  personId!: string;

  @Matches(/^\d{9}$/, { message: 'The bank routing code is 9 digits.' })
  routingCode!: string;

  @upper()
  @Matches(/^AE\d{21}$/, { message: 'A UAE IBAN is AE and 21 digits.' })
  iban!: string;
}

export class W9Dto {
  @IsUUID()
  consultantId!: string;

  @IsIn(['SSN', 'EIN'])
  tinKind!: 'SSN' | 'EIN';

  @Matches(/^\d{9}$/, { message: 'The TIN is 9 digits (no dashes).' })
  tin!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName!: string;

  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  street!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @upper()
  @Matches(/^[A-Z]{2}$/)
  state!: string;

  @Matches(/^\d{5}(-\d{4})?$/)
  zip!: string;

  @Matches(DAY)
  receivedOn!: string;
}

export class TaxYearDto {
  @IsUUID()
  legalEntityId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;
}
