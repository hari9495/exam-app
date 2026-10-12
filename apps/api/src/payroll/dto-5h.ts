import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Batch 5h DTOs (M03-BUILD-DESIGN §14.7): the consultant register, s.197 certificates, invoices, payouts and the portal.
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SECTIONS = ['194C', '194J_A', '194J_B'] as const;
export type Section = (typeof SECTIONS)[number];

export class BankDto {
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  holder!: string;

  @upper()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'An IFSC is 11 letters and digits, like HDFC0001234.' })
  ifsc!: string;

  @Matches(/^\d{9,18}$/, { message: 'A bank account number is 9 to 18 digits.' })
  account!: string;
}

export class ConsultantDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsIn(['individual', 'firm'])
  kind!: 'individual' | 'firm';

  @trim()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  /** Absent: no PAN (TDS at the higher no-PAN rate, s.206AA). */
  @IsOptional()
  @upper()
  @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: 'A PAN is 10 letters and digits, like ABCDE1234F.' })
  pan?: string;

  @IsOptional()
  @IsIn(['operative', 'inoperative'])
  panStatus?: 'operative' | 'inoperative';

  @IsOptional()
  @upper()
  @Matches(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, { message: 'A GSTIN is 15 letters and digits, like 29ABCDE1234F1Z5.' })
  gstin?: string;

  @IsIn(SECTIONS)
  defaultSection!: Section;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankDto)
  bank?: BankDto;
}

export class ConsultantUpdateDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @trim()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @upper()
  @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: 'A PAN is 10 letters and digits, like ABCDE1234F.' })
  pan?: string;

  @IsOptional()
  @IsIn(['operative', 'inoperative'])
  panStatus?: 'operative' | 'inoperative';

  @IsOptional()
  @upper()
  @Matches(/^(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, { message: 'A GSTIN is 15 letters and digits, like 29ABCDE1234F1Z5.' })
  gstin?: string;

  @IsOptional()
  @IsIn(SECTIONS)
  defaultSection?: Section;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankDto)
  bank?: BankDto;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class VerifyBankDto {
  @trim()
  @Matches(/^[A-Za-z0-9-]{6,60}$/, { message: 'The penny-drop reference is 6 to 60 letters, digits or -.' })
  reference!: string;
}

export class CertificateDto197 {
  @trim()
  @Matches(/^[A-Za-z0-9/-]{4,30}$/, { message: 'A certificate number is 4 to 30 letters, digits, / or -.' })
  certificateNo!: string;

  @IsIn(SECTIONS)
  section!: Section;

  @Matches(/^0(\.\d{1,4})?$/, { message: 'The rate is a fraction below 1, like 0.02 for 2%.' })
  rate!: string;

  @Matches(DAY)
  validFrom!: string;

  @Matches(DAY)
  validTo!: string;

  @Matches(MONEY)
  limit!: string;
}

export class InvoiceDto {
  @trim()
  @Matches(/^[A-Za-z0-9/._-]{1,40}$/, { message: 'An invoice number is up to 40 letters, digits, / . _ or -.' })
  invoiceNo!: string;

  @Matches(DAY)
  invoiceDate!: string;

  /** The month the work is for (YYYY-MM). */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @Matches(MONEY)
  taxableValue!: string;

  @IsOptional()
  @Matches(MONEY)
  cgst?: string;

  @IsOptional()
  @Matches(MONEY)
  sgst?: string;

  @IsOptional()
  @Matches(MONEY)
  igst?: string;

  @IsOptional()
  @IsIn(SECTIONS)
  section?: Section;
}

export class StaffInvoiceDto extends InvoiceDto {
  @IsUUID()
  consultantId!: string;
}

export class InvoiceListDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @IsIn(['submitted', 'approved', 'rejected', 'queued', 'sent', 'paid', 'failed'])
  status?: string;
}

export class ConsultantPayoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  invoiceIds!: string[];

  @Matches(/^\d{6,20}$/, { message: 'The account the money comes from is 6 to 20 digits.' })
  debitAccount!: string;
}

export class ConsultantReleaseDto {
  @trim()
  @IsString()
  @MaxLength(40)
  phrase!: string;
}

export class ConsultantResultRowDto {
  @IsUUID()
  invoiceId!: string;

  @IsIn(['paid', 'failed'])
  status!: 'paid' | 'failed';

  @IsOptional()
  @Matches(/^[A-Za-z0-9/-]{1,60}$/, { message: 'A bank reference is letters, digits, / and -.' })
  ref?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}

export class ConsultantResultsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ConsultantResultRowDto)
  rows!: ConsultantResultRowDto[];
}

export class Form131ImportDto {
  @IsUUID()
  legalEntityId!: string;

  @Matches(/^\d{4}-\d{2}$/)
  taxYear!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quarter!: number;
}

export class ConsultantPortalEmailDto {
  @trim()
  @IsEmail()
  @MaxLength(200)
  email!: string;
}

export class ConsultantPortalVerifyDto extends ConsultantPortalEmailDto {
  @Matches(/^\d{6}$/)
  code!: string;
}
