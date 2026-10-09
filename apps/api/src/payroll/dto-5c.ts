import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ConfirmationDto } from './dto';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const DAYS = /^\d{1,2}(\.\d{1,2})?$/;

export class RunCreateDto {
  @IsUUID()
  payGroupId!: string;

  @Matches(MONTH)
  month!: string;
}

export class RunListDto {
  @IsOptional()
  @Matches(MONTH)
  month?: string;
}

export class ReasonDto {
  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class SubmitRunDto {
  /** Only when no one else can approve: the preparer approves it, with a reason; the System Admins are told. */
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  selfApprovalReason?: string;
}

export class RunDecisionDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation?: ConfirmationDto;
}

export class AckDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class LopRowDto {
  @IsUUID()
  employeeId!: string;

  @Matches(DAYS)
  lopDays!: string;

  @trim()
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class LopInputsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => LopRowDto)
  rows!: LopRowDto[];

  @IsOptional()
  @IsIn(['manual', 'upload'])
  source?: 'manual' | 'upload';
}

export class OneTimeDto {
  @IsUUID()
  employeeId!: string;

  @Matches(/^[a-z][a-z0-9_]{0,29}$/)
  componentCode!: string;

  @Matches(MONEY)
  amount!: string;

  @Matches(MONTH)
  month!: string;

  /** A recurring item: its last day (the last month is paid prorated). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endOn?: string;

  @trim()
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class OneTimeListDto {
  @IsOptional()
  @Matches(MONTH)
  month?: string;
}

export class SpecialDaysDto {
  @IsUUID()
  employeeId!: string;

  @Matches(MONTH)
  month!: string;

  @IsIn(['suspension', 'maternity', 'injury'])
  kind!: 'suspension' | 'maternity' | 'injury';

  @Matches(DAYS)
  days!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  daysBefore?: number;

  @trim()
  @IsString()
  @Length(3, 300)
  note!: string;
}

export class HoldDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(['absconding', 'exit_pending', 'investigation', 'employee_request', 'other'])
  reasonCode!: string;

  @trim()
  @IsString()
  @Length(5, 300)
  note!: string;
}

export class LoanRequestDto {
  /** Omitted: a request for yourself. */
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsIn(['advance', 'loan'])
  loanType!: 'advance' | 'loan';

  @Matches(MONEY)
  principal!: string;

  @IsInt()
  @Min(1)
  @Max(120)
  instalments!: number;

  @IsOptional()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/)
  interestRate?: string;

  @Matches(MONTH)
  firstMonth!: string;

  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;
}

export class LoanDecisionDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class LoanChangeDto {
  @IsIn(['pause', 'preclose', 'reschedule'])
  kind!: 'pause' | 'preclose' | 'reschedule';

  /** pause: paused until this month (the instalments resume after it). */
  @IsOptional()
  @Matches(MONTH)
  pauseUntil?: string;

  /** reschedule: the new instalment. */
  @IsOptional()
  @Matches(MONEY)
  emi?: string;

  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;
}

export class CourtOrderDto {
  @IsUUID()
  employeeId!: string;

  @trim()
  @IsString()
  @Length(3, 80)
  orderRef!: string;

  @IsOptional()
  @Matches(MONEY)
  amount?: string;

  @IsOptional()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/)
  percent?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  priorityDate!: string;

  /** Who receives it (account and bank code); stored encrypted. */
  @trim()
  @IsString()
  @Length(5, 200)
  payee!: string;

  @IsOptional()
  @Matches(MONEY)
  capTotal?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endOn?: string;
}

export class JournalExportDto {
  @IsIn(['csv', 'tally', 'zoho'])
  format!: 'csv' | 'tally' | 'zoho';
}

export class CostRateListDto {
  @IsDefined()
  @Matches(MONTH)
  month!: string;
}
