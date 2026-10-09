import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIdentityCard, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested, ValidateIf } from 'class-validator';
import { PAN } from '../org-structure/org-validation';

// Bodies for the employee's Personal data (P02 §4.4) and identity / bank change requests (§4.5). Every field
// is whitelisted by the global pipe; identifiers are checked with proven validators (validator.js Verhoeff for
// Aadhaar, M01 YX-EMP-01) and fixed formats.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const GENDERS = ['female', 'male', 'transgender', 'non_binary', 'prefer_not_to_say'] as const;

/** Personal class fields; null clears one, absent leaves it. */
export class PersonalDetailsDto {
  @IsOptional() @IsDateString({ strict: true }) @Matches(DATE, { message: 'dateOfBirth is a date (YYYY-MM-DD)' })
  dateOfBirth?: string | null;

  @IsOptional() @IsIn(GENDERS)
  gender?: string | null;

  @IsOptional() @IsEmail() @MaxLength(254)
  personalEmail?: string | null;

  @IsOptional() @IsString() @MaxLength(30)
  personalPhone?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  addressLine1?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  addressLine2?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  city?: string | null;

  @IsOptional() @Matches(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, { message: 'stateCode is an ISO 3166-2 code, e.g. IN-KA' })
  stateCode?: string | null;

  @IsOptional() @Matches(/^[A-Za-z0-9 -]{3,12}$/, { message: 'postalCode is 3–12 letters or digits' })
  postalCode?: string | null;

  @IsOptional() @Matches(/^[A-Z]{2}$/, { message: 'country is an ISO 3166-1 alpha-2 code' })
  country?: string | null;

  @IsOptional() @IsBoolean()
  hideBirthday?: boolean;
}

export const REQUEST_KINDS = ['bank_salary', 'bank_reimbursement', 'pan', 'aadhaar', 'uan', 'esic', 'legal_name'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/** The proposed value; only the part the kind needs is read (the rest must be absent). */
export class ProposedValueDto {
  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @Matches(PAN, { message: 'pan is 5 letters, 4 digits, 1 letter (e.g. ABCPE1234F)' })
  pan?: string;

  // M01 YX-EMP-01: 12 digits, never starting 0 or 1, Verhoeff checksum (validator.js).
  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @Matches(/^[2-9][0-9]{11}$/, { message: 'aadhaar is 12 digits' }) @IsIdentityCard('IN', { message: 'That Aadhaar number fails its checksum' })
  aadhaar?: string;

  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @Matches(/^[0-9]{12}$/, { message: 'uan is 12 digits' })
  uan?: string;

  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @Matches(/^[0-9]{10}$/, { message: 'esic is the 10-digit ESIC IP number' })
  esic?: string;

  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @IsString() @MinLength(1) @MaxLength(200)
  legalName?: string;

  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @IsString() @MinLength(1) @MaxLength(200)
  holderName?: string;

  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @Matches(/^[0-9]{9,18}$/, { message: 'accountNumber is 9 to 18 digits' })
  accountNumber?: string;

  // RBI IFSC: four letters, a zero, six letters or digits.
  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'ifsc is 11 characters, e.g. HDFC0001234' })
  ifsc?: string;
}

export class ProfileRequestDto {
  @IsIn(REQUEST_KINDS)
  kind!: RequestKind;

  @ValidateNested()
  @Type(() => ProposedValueDto)
  value!: ProposedValueDto;

  @IsString() @MinLength(1) @MaxLength(500)
  reason!: string;
}

export class ProfileDecisionDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  /** YX-EMP-02: approving a value another active employee already has needs a reason. */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500)
  overrideReason?: string;
}

export class ProfileReasonDto {
  @IsString() @MinLength(1) @MaxLength(500)
  reason!: string;
}

export const REVEAL_FIELDS = ['pan', 'aadhaar', 'uan', 'esic', 'bank_salary', 'bank_reimbursement'] as const;
export class RevealDto {
  @IsIn(REVEAL_FIELDS)
  field!: (typeof REVEAL_FIELDS)[number];
}

export class ProfileRequestListDto {
  @IsOptional() @IsIn(['pending', 'approved', 'rejected', 'cancelled'])
  status?: string;
}

/** The fields each kind takes. */
export const KIND_FIELDS: Record<RequestKind, (keyof ProposedValueDto)[]> = {
  pan: ['pan'],
  aadhaar: ['aadhaar'],
  uan: ['uan'],
  esic: ['esic'],
  legal_name: ['legalName'],
  bank_salary: ['holderName', 'accountNumber', 'ifsc'],
  bank_reimbursement: ['holderName', 'accountNumber', 'ifsc'],
};
