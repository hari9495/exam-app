import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsDefined, IsEmail, IsISO8601, IsIn, IsObject, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class YearDto {
  @Matches(/^\d{4}$/)
  year!: string;
}

export class EntityMonthDto {
  @IsUUID()
  legalEntityId!: string;

  @Matches(MONTH)
  month!: string;
}

/** What the person saw and confirmed in the irreversible-action sheet (APX-D §6.4, YX-AUD-09). */
export class ImpactRowDto {
  @trim()
  @IsString()
  @MaxLength(80)
  label!: string;

  @trim()
  @IsString()
  @MaxLength(200)
  value!: string;
}

export class ConfirmationDto {
  /** The typed phrase; the server checks it against the one it expects. */
  @trim()
  @IsString()
  @MaxLength(80)
  phrase!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ImpactRowDto)
  impact!: ImpactRowDto[];
}

export class ReopenRequestDto extends EntityMonthDto {
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class ReopenDecisionDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Needed to approve (the phrase "REOPEN <entity short name> <month>"). */
  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation?: ConfirmationDto;
}

export class LateCorrectionDto {
  @IsDateString({ strict: true })
  on!: string;

  @IsIn(['attendance', 'leave'])
  kind!: 'attendance' | 'leave';

  /**
   * Answer 2282: what the day should have been, a fixed choice: "present", "half_day", "unpaid" or "leave:<leave type
   * code>" (the leave type is checked against the company's).
   */
  @trim()
  @IsString()
  @Matches(/^(present|half_day|unpaid|leave:[A-Za-z0-9_-]{1,20})$/, { message: 'Choose what the day should have been: present, half day, a leave type or unpaid.' })
  shouldBe!: string;

  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

/** Batch A item 8 (D15): one day of an LOP reversal and what it should have been (never "unpaid": that is no reversal). */
export class LopReversalDayDto {
  @IsDateString({ strict: true })
  on!: string;

  @trim()
  @IsString()
  @Matches(/^(present|half_day|leave:[A-Za-z0-9_-]{1,20})$/, { message: 'Choose what the day should have been: a paid day, a half day or a leave type.' })
  shouldBe!: string;
}

/** Batch A item 8 (D15, answer 2315): HR reverses loss of pay for days of a locked month, paid in the next regular run. */
export class LopReversalDto {
  @IsUUID()
  employeeId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(31)
  @ValidateNested({ each: true })
  @Type(() => LopReversalDayDto)
  days!: LopReversalDayDto[];

  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class HrCorrectionDto extends LateCorrectionDto {
  @IsUUID()
  employeeId!: string;
}

export class DevicePunchDto {
  @trim()
  @IsString()
  @Length(1, 40)
  employeeCode!: string;

  @IsISO8601({ strict: true })
  at!: string;

  @IsIn(['in', 'out'])
  kind!: 'in' | 'out';
}

export class DeviceBatchDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @Length(1, 100)
  deviceRef!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => DevicePunchDto)
  punches!: DevicePunchDto[];
}

export class BackfillDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @Length(1, 100)
  deviceRef!: string;

  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation!: ConfirmationDto;
}

// ------------------------------------------------------------------------------------------ audit

export class AuditQueryDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  /** The chain position to read before (newest first). */
  @IsOptional()
  @Matches(/^\d{1,18}$/)
  before?: string;

  /** Settings S-5 (answer 1563): one area of the company audit log (AUDIT_AREAS). */
  @IsOptional()
  @IsIn(['settings', 'access', 'people', 'time', 'payroll', 'hiring', 'performance', 'expenses', 'helpdesk', 'approvals', 'projects'])
  area?: string;

  /** Answer 1563: a person, by any part of their name or email. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  actor?: string;
}

export class TimelineQueryDto {
  @trim()
  @IsString()
  @Length(1, 60)
  entityType!: string;

  @trim()
  @IsString()
  @Length(1, 100)
  entityId!: string;
}

export class LegalHoldDto {
  @trim()
  @IsString()
  @Length(3, 100)
  caseRef!: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsDateString({ strict: true })
  from!: string;

  @IsDateString({ strict: true })
  to!: string;

  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

// ------------------------------------------------------------------------------------------ documents

export class PayLineDto {
  @trim()
  @IsString()
  @Length(1, 60)
  label!: string;

  /** Rupees and paise as text ("12500.00"): money is never a JS number (§5.1). */
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  amount!: string;
}

export class IssueDocumentDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(['payslip', 'revision_letter', 'payment_advice'])
  kind!: 'payslip' | 'revision_letter' | 'payment_advice';

  @IsOptional()
  @Matches(MONTH)
  month?: string;

  /** The template's merge fields (checked against its mandatory list, YX-DOC-07). */
  @IsObject()
  fields!: Record<string, unknown>;

  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation!: ConfirmationDto;
}

export class SupersedeDocumentDto {
  @IsObject()
  fields!: Record<string, unknown>;

  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation!: ConfirmationDto;
}

export class DocumentListDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class NomineeDto {
  @IsUUID()
  employeeId!: string;

  @trim()
  @IsString()
  @Length(2, 200)
  name!: string;

  @trim()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsDateString({ strict: true })
  validUntil!: string;
}

export class PortalEmailDto {
  @trim()
  @IsEmail()
  @MaxLength(200)
  email!: string;
}

export class PortalVerifyDto extends PortalEmailDto {
  @Matches(/^\d{6}$/)
  code!: string;
}

// ------------------------------------------------------------------------------------------ exchange files

export class FileListDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class ReleaseFileDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation!: ConfirmationDto;
}
