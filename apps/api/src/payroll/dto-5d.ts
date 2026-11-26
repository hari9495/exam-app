import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { ConfirmationDto } from './dto';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class ConfirmDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation!: ConfirmationDto;
}

export class PublishDto extends ConfirmDto {
  /** PAY-09: only when no one else may publish this run's payslips; stored in the audit event, the System Admins are told. */
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  selfApprovalReason?: string;

  /** Enterprise E5 (O17, answer 2657): show the payslips now although the release date is later (needs releaseReason). */
  @IsOptional()
  @IsBoolean()
  releaseNow?: boolean;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  releaseReason?: string;
}

export class GenerateBankFileDto {
  /** The company's account the bank debits (digits only; only its last four are kept outside the file). */
  @Matches(/^\d{6,20}$/, { message: 'The debit account is 6 to 20 digits.' })
  debitAccount!: string;

  /** The day the bank pays (defaults to today). */
  @IsOptional()
  @Matches(DATE)
  payDate?: string;

  /** Needed when the run already has a bank file. */
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason?: string;
}

export class PaymentResultRowDto {
  @IsOptional()
  @IsUUID()
  payslipId?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(30)
  employeeCode?: string;

  @IsIn(['paid', 'failed', 'returned'])
  status!: 'paid' | 'failed' | 'returned';

  @IsOptional()
  @trim()
  @Matches(/^[A-Za-z0-9/-]{1,60}$/, { message: 'A bank reference is letters, digits, / and -.' })
  bankReference?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;

  /** PAY-10: why the bank refused it; "ifsc" = the IFSC on file is not valid (the payslip waits for a corrected account). */
  @IsOptional()
  @IsIn(['ifsc', 'account', 'other'])
  cause?: 'ifsc' | 'account' | 'other';
}

export class PaymentResultsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => PaymentResultRowDto)
  rows!: PaymentResultRowDto[];
}

export class PaymentModeDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(['bank', 'cash', 'cheque'])
  mode!: 'bank' | 'cash' | 'cheque';

  @Matches(DATE)
  validFrom!: string;

  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class DisbursementDto {
  @IsUUID()
  payslipId!: string;

  @IsIn(['cash', 'cheque'])
  mode!: 'cash' | 'cheque';

  @IsOptional()
  @Matches(/^\d{6,10}$/, { message: 'A cheque number is 6 to 10 digits.' })
  chequeNo?: string;

  @Matches(DATE)
  paidOn!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  acknowledgement?: string;
}

export class ExpediteBankDto {
  /** The bank's reference for the one-rupee test credit that confirmed the new account and its holder's name. */
  @trim()
  @Matches(/^[A-Za-z0-9-]{6,40}$/, { message: 'The penny-drop reference is 6 to 40 letters, digits or -.' })
  pennyDropReference!: string;

  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class QueryRaiseDto {
  @IsOptional()
  @Matches(/^[a-z0-9_]{1,30}$/)
  lineCode?: string;

  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  text!: string;
}

export class QueryUpdateDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reply?: string;

  @IsOptional()
  @IsIn(['open', 'answered', 'closed'])
  status?: 'open' | 'answered' | 'closed';

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string;
}

export class QueryListDto {
  @IsOptional()
  @IsIn(['open', 'answered', 'closed'])
  status?: 'open' | 'answered' | 'closed';
}


/** Pay a failed or returned payment again (PAY-10 "Returned payment · re-pay route"). */
export class RepayDto {
  @IsIn(['next_bank_file', 'offcycle', 'reimbursement_account'], { message: 'Choose how to pay: next bank file, off-cycle payment now, or the reimbursement account.' })
  route!: 'next_bank_file' | 'offcycle' | 'reimbursement_account';

  @trim()
  @IsString()
  @MinLength(5, { message: 'Say why, in a few words (at least 5 characters).' })
  @MaxLength(300)
  reason!: string;

  /** The company's account the bank debits; needed for a file made now (off-cycle or reimbursement account). */
  @IsOptional()
  @Matches(/^\d{6,20}$/, { message: 'The debit account is 6 to 20 digits.' })
  debitAccount?: string;
}
