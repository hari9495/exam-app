import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CHANGE_TYPES, ChangeType, EMPLOYMENT_STATUSES, EmploymentStatus } from './history-rules';

// Request bodies for the employee core and P06 changes. Every field is whitelisted (the global pipe
// refuses anything else); amounts and percentages are decimal strings so no float ever touches pay.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'a date (YYYY-MM-DD)';
const AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const PERCENT = /^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/;
/** null clears an optional field; undefined leaves it out. */
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class CostCentreShareDto {
  @IsUUID()
  costCentreId!: string;

  @Matches(/^(?:100(?:\.0{1,2})?|[1-9]?\d(?:\.\d{1,2})?)$/, { message: 'percent is 0–100 with up to 2 decimals' })
  percent!: string;
}

export class AssignmentPayloadDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @Nullable()
  @IsUUID()
  gradeId?: string | null;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string;

  @Nullable()
  @IsUUID()
  managerEmployeeId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CostCentreShareDto)
  costCentres?: CostCentreShareDto[];

  /** M01 Q5: dotted-line managers (visibility and feedback only). The whole list replaces the old one. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  dottedLineManagerIds?: string[];
}

export class CompensationPayloadDto {
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @Matches(AMOUNT, { message: 'annualCtc is an amount with up to 2 decimals' })
  annualCtc?: string;

  @IsOptional()
  @Matches(PERCENT, { message: 'increasePercent is a percentage with up to 2 decimals' })
  increasePercent?: string;
}

export class ChangePayloadDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AssignmentPayloadDto)
  assignment?: AssignmentPayloadDto;

  @IsOptional()
  @IsIn(EMPLOYMENT_STATUSES)
  status?: EmploymentStatus;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CompensationPayloadDto)
  compensation?: CompensationPayloadDto;
}

export class ChangeRequestDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(CHANGE_TYPES.filter((t) => t !== 'join'))
  changeType!: Exclude<ChangeType, 'join'>;

  @IsDateString({ strict: true })
  @Matches(DATE, { message: `effectiveDate is ${DATE_MESSAGE}` })
  effectiveDate!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ChangePayloadDto)
  payload!: ChangePayloadDto;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  /** YX-HIS-12: required for a date before the company's retro limit. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  overrideReason?: string;
}

/** Q7: a pending or scheduled change may be edited until it takes effect. */
export class ChangeEditDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE, { message: `effectiveDate is ${DATE_MESSAGE}` })
  effectiveDate?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChangePayloadDto)
  payload?: ChangePayloadDto;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  overrideReason?: string;
}

export class ApproveDto {
  /** YX-HIS-06: the approver has seen the recalculated later changes. */
  @IsOptional()
  @IsBoolean()
  confirmRebase?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class DecisionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  /** Cancelling a scheduled change may rebase later ones too (YX-HIS-06). */
  @IsOptional()
  @IsBoolean()
  confirmRebase?: boolean;
}

/** P01 §4.4: a new employee with their employment and first assignment, written by a join change. */
export class EmployeeCreateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  givenName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  familyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  workEmail?: string;

  /** Mobile, any common format; stored in E.164 on the person (YX-ORG-28). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobilePhone?: string;

  /** P01 §4.5a / YX-ORG-27: HR confirmed the record belongs to this existing person. */
  @IsOptional()
  @IsUUID()
  personId?: string;

  /** The person's login, when they have one (P01 §4.5). */
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsUUID()
  legalEntityId!: string;

  /** Generated when left out (YX-ORG-16). */
  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9/_-]{0,29}$/, { message: 'employeeCode is up to 30 letters, digits, /, - or _' })
  employeeCode?: string;

  @IsDateString({ strict: true })
  @Matches(DATE, { message: `joinedOn is ${DATE_MESSAGE}` })
  joinedOn!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AssignmentPayloadDto)
  assignment!: AssignmentPayloadDto;

  @IsIn(['probation', 'confirmed'])
  status!: 'probation' | 'confirmed';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CompensationPayloadDto)
  compensation?: CompensationPayloadDto;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  /** YX-HIS-12: a joining date before the retro limit needs a reason. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  overrideReason?: string;
}

export class AsOfQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE, { message: `date is ${DATE_MESSAGE}` })
  date?: string;

  /** Q1: what we believed at that moment (bitemporal-lite). */
  @IsOptional()
  @IsISO8601({ strict: true })
  recordedAt?: string;

  /** R1: pay is sent only when asked for ("Show pay"), and each look is recorded. */
  @IsOptional()
  @IsIn(['true', 'false'])
  pay?: 'true' | 'false';
}

export class HistoryQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  pay?: 'true' | 'false';
}

export class SegmentsQueryDto {
  @IsDateString({ strict: true })
  @Matches(DATE, { message: `from is ${DATE_MESSAGE}` })
  from!: string;

  @IsDateString({ strict: true })
  @Matches(DATE, { message: `to is ${DATE_MESSAGE}` })
  to!: string;
}

export class ChangeListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'scheduled', 'effective', 'rejected', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE, { message: `from is ${DATE_MESSAGE}` })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE, { message: `to is ${DATE_MESSAGE}` })
  to?: string;
}

export class EmployeeListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
