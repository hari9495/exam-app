import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
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

  /** Batch 5g: an off-cycle run of this kind (absent: the regular run; F&F runs are made by the F&F settlement). */
  @IsOptional()
  @IsIn(['bonus', 'arrears', 'correction', 'payment'])
  offcycleKind?: 'bonus' | 'arrears' | 'correction' | 'payment';

  /** PAY-9.01: which pay period of the month, for a weekly or fortnightly group's regular run. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  subPeriod?: number;
}

export class RunListDto {
  @IsOptional()
  @Matches(MONTH)
  month?: string;

  /** The company chosen in the top bar (design audit step 2); personal views ignore it. */
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
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

  /** PAY-9.01: the first day of a weekly or fortnightly pay period in the month (absent: the whole month). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodStart?: string;
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

  /** PAY-05: keep it as a draft (sent for approval later, alone or in bulk). */
  @IsOptional()
  @IsBoolean()
  draft?: boolean;

  /** Enterprise E5 (O16): paid on its own bank file line and payslip section, in the same month. */
  @IsOptional()
  @IsBoolean()
  paidSeparately?: boolean;

  /** Enterprise E5 (O16): the company pays the tax on it (needs the payroll approver). */
  @IsOptional()
  @IsBoolean()
  grossUp?: boolean;
}

/** PAY-05 bulk actions on one-time pay drafts. */
export class OneTimeBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids!: string[];

  @IsIn(['submit', 'delete'])
  action!: 'submit' | 'delete';
}

/** PAY-05 effect summary: what the item does to the month's pay (worked out by the payroll calculator). */
export class OneTimeEffectDto {
  @IsUUID()
  employeeId!: string;

  @Matches(/^[a-z][a-z0-9_]{0,29}$/)
  componentCode!: string;

  @Matches(MONEY)
  amount!: string;

  @Matches(MONTH)
  month!: string;
}

export class OneTimeListDto {
  @IsOptional()
  @Matches(MONTH)
  month?: string;
}

export class SpecialDaysListDto {
  @Matches(MONTH)
  month!: string;
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

/** D14 (answers 2404, 2405): the loan type the SBI rate is read for, and the company's exempt mark with its reason. */
export class LoanPerquisiteDto {
  @IsIn(['housing', 'vehicle', 'education', 'personal', 'other'])
  purpose!: 'housing' | 'vehicle' | 'education' | 'personal' | 'other';

  /** Exempt: medical treatment of a disease named in Rule 3A (the only exemption a company marks). */
  @IsBoolean()
  exempt!: boolean;

  @IsOptional()
  @trim()
  @IsString()
  @Length(5, 300)
  reason?: string;
}

/** PAY-19: a month's court-order deduction paid to the court. */
export class RemittanceDto {
  @Matches(MONTH)
  month!: string;

  @trim()
  @Matches(/^[A-Za-z0-9/ -]{3,60}$/, { message: 'The payment reference is 3 to 60 letters, digits, spaces, / or -.' })
  reference!: string;
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
  // Enterprise E4 (O22, answer 2655): SAP flat file and the Oracle GL interface besides CSV, Tally and Zoho Books.
  @IsIn(['csv', 'tally', 'zoho', 'sap', 'oracle'])
  format!: 'csv' | 'tally' | 'zoho' | 'sap' | 'oracle';
}

export class CostRateListDto {
  @IsDefined()
  @Matches(MONTH)
  month!: string;
}

/** PAY-06 release (founder 29 Oct 2026): a reason (kept in the audit trail) and where the held pay goes. */
export class HoldReleaseDto {
  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;

  /** next_bank_file: the next bank file made for the held run pays it; offcycle: paid now, an off-cycle bank file from that run. */
  @IsIn(['next_bank_file', 'offcycle'])
  route!: 'next_bank_file' | 'offcycle';
}
