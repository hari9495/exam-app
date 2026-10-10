import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIdentityCard, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// The pre-boarding portal's forms (M01 Q2 default sections; design §8.2). The server checks every answer; identity
// and bank answers are sealed and only ever shown back masked.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class PortalEmailDto {
  @trim()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Cloudflare Turnstile token (checked when the company has it on). */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  challengeToken?: string;
}

export class PortalVerifyDto {
  @trim()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Matches(/^[0-9]{6}$/, { message: 'Enter the 6-digit code.' })
  code!: string;
}

export class PortalCodeDto {
  @Matches(/^[0-9]{6}$/, { message: 'Enter the 6-digit code.' })
  code!: string;
}

export class PersonalSectionDto {
  @Matches(ISO, { message: 'Give your date of birth.' })
  dateOfBirth!: string;

  @IsIn(['female', 'male', 'transgender', 'other', 'prefer_not_to_say'])
  gender!: string;

  @trim()
  @IsString()
  @Length(3, 200)
  addressLine1!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @trim()
  @IsString()
  @Length(2, 100)
  city!: string;

  @Matches(/^IN-[A-Z]{2}$/, { message: 'Choose your state.' })
  stateCode!: string;

  @Matches(/^[1-9][0-9]{5}$/, { message: 'The PIN code is 6 digits.' })
  postalCode!: string;
}

export class IdentitySectionDto {
  @trim()
  @IsString()
  @Length(2, 200)
  legalName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'PAN is 5 letters, 4 digits, 1 letter (e.g. ABCPE1234F).' })
  pan!: string;

  /** Optional: Aadhaar is never forced (design §18.2); another ID can be shown on day one. */
  @IsOptional()
  @Matches(/^[2-9][0-9]{11}$/, { message: 'Aadhaar is 12 digits.' })
  @IsIdentityCard('IN', { message: 'That Aadhaar number fails its check.' })
  aadhaar?: string;

  @IsOptional()
  @Matches(/^[0-9]{12}$/, { message: 'UAN is 12 digits.' })
  uan?: string;
}

export class BankSectionDto {
  @trim()
  @IsString()
  @Length(2, 200)
  holderName!: string;

  @Matches(/^[0-9]{9,18}$/, { message: 'The account number is 9 to 18 digits.' })
  accountNumber!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'IFSC is 11 characters, e.g. HDFC0001234.' })
  ifsc!: string;
}

export class EmergencySectionDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @trim()
  @IsString()
  @Length(2, 40)
  relation!: string;

  @Matches(/^\+?[0-9 ]{10,16}$/, { message: 'Give a phone number.' })
  phone!: string;
}

export class NomineeDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @trim()
  @IsString()
  @Length(2, 40)
  relation!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  sharePercent!: number;
}

export class NomineesSectionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => NomineeDto)
  nominees!: NomineeDto[];
}

export class TaxSectionDto {
  @IsIn(['new', 'old'])
  regime!: 'new' | 'old';
}

export class BgvConsentDto {
  @IsBoolean()
  consent!: boolean;

  /** The notice version the person read. */
  @Matches(/^BGV v\d+$/)
  noticeVersion!: string;
}

export class PortalSignDto {
  @Matches(/^[0-9]{6}$/, { message: 'Enter the 6-digit code.' })
  code!: string;

  @IsBoolean()
  accept!: boolean;

  @IsOptional()
  @IsBoolean()
  disclosureAccepted?: boolean;
}
