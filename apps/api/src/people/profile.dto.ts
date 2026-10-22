import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIdentityCard, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested, ValidateIf } from 'class-validator';
import { PAN } from '../org-structure/org-validation';

// Bodies for the employee's Personal data (P02 §4.4) and identity / bank change requests (§4.5). Every field
// is whitelisted by the global pipe; identifiers are checked with proven validators (validator.js Verhoeff for
// Aadhaar, M01 YX-EMP-01) and fixed formats.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const GENDERS = ['female', 'male', 'transgender', 'non_binary', 'prefer_not_to_say'] as const;
export const MARITAL = ['single', 'married', 'separated', 'divorced', 'widowed', 'prefer_not_to_say'] as const;

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

  @IsOptional() @IsIn(MARITAL)
  maritalStatus?: string | null;
}

/** PPL-03 Additional details: definition id -> value (null or '' clears); each value is checked against its field type. */
export class CustomFieldValuesDto {
  @IsObject()
  values!: Record<string, unknown>;
}

/** Work phone (Internal): HR with employee.profile.edit; null clears it. */
export class WorkPhoneDto {
  @IsOptional() @IsString() @MaxLength(30)
  workPhone!: string | null;
}

export const REQUEST_KINDS = ['bank_salary', 'bank_reimbursement', 'pan', 'aadhaar', 'uan', 'esic', 'legal_name', 'passport'] as const;
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

  // A passport number: 6 to 9 capital letters and digits (India: a letter and 7 digits).
  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @Matches(/^[A-Z0-9]{6,9}$/, { message: 'passport is 6 to 9 capital letters and digits' })
  passport?: string;

  @ValidateIf((o: ProposedValueDto, v) => v !== undefined) @IsDateString({ strict: true }) @Matches(DATE, { message: 'passportExpiresOn is a date (YYYY-MM-DD)' })
  passportExpiresOn?: string;

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

export const REVEAL_FIELDS = ['pan', 'aadhaar', 'uan', 'esic', 'passport', 'bank_salary', 'bank_reimbursement'] as const;
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
  passport: ['passport', 'passportExpiresOn'],
  bank_salary: ['holderName', 'accountNumber', 'ifsc'],
  bank_reimbursement: ['holderName', 'accountNumber', 'ifsc'],
};

// ---- PPL-03 family, nominations and emergency contacts (Personal class) ----

export const NOMINATION_SCHEMES = ['pf', 'eps', 'gratuity', 'group_term'] as const;

export class FamilyMemberDto {
  /** An existing member keeps its id (its nominations stay pointed at it); absent adds one. */
  @IsOptional() @IsUUID()
  id?: string;

  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @IsString() @MinLength(1) @MaxLength(40)
  relation!: string;

  @IsOptional() @IsDateString({ strict: true }) @Matches(DATE, { message: 'dateOfBirth is a date (YYYY-MM-DD)' })
  dateOfBirth?: string | null;

  @IsBoolean()
  dependant!: boolean;
}

export class NominationDto {
  @IsIn(NOMINATION_SCHEMES)
  scheme!: (typeof NOMINATION_SCHEMES)[number];

  /** The nominee: an index into members (a nominee is always one of the person's family). */
  @IsInt() @Min(0)
  member!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100)
  sharePercent!: number;
}

/** The whole family and the nominations in one save, so shares are checked against the family as saved. */
export class FamilyDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => FamilyMemberDto)
  members!: FamilyMemberDto[];

  @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => NominationDto)
  nominations!: NominationDto[];
}

export class EmergencyContactDto {
  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @IsString() @MinLength(1) @MaxLength(40)
  relation!: string;

  @IsString() @MaxLength(30)
  phone!: string;
}

/** In calling order: the first is called first. */
export class EmergencyContactsDto {
  @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => EmergencyContactDto)
  contacts!: EmergencyContactDto[];
}

/** Nominees are members of the family being saved, each once per scheme, and each scheme's shares total exactly 100. */
export function nominationProblem(memberCount: number, nominations: Pick<NominationDto, 'scheme' | 'member' | 'sharePercent'>[]): string | null {
  const totals = new Map<string, number>();
  const seen = new Set<string>();
  for (const n of nominations) {
    if (!Number.isInteger(n.member) || n.member < 0 || n.member >= memberCount) return 'A nominee must be one of the family members.';
    if (seen.has(`${n.scheme}:${n.member}`)) return 'A family member is nominated once per scheme.';
    seen.add(`${n.scheme}:${n.member}`);
    // In hundredths, so 33.33 + 33.33 + 33.34 is exactly 100.
    totals.set(n.scheme, (totals.get(n.scheme) ?? 0) + Math.round(n.sharePercent * 100));
  }
  for (const [scheme, total] of totals) if (total !== 10000) return `The ${SCHEME_LABEL[scheme] ?? scheme} shares must total 100% (now ${total / 100}%).`;
  return null;
}

export const SCHEME_LABEL: Record<string, string> = { pf: 'PF', eps: 'EPS', gratuity: 'Gratuity', group_term: 'Group term insurance', all: 'All schemes' };
