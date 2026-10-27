import { Type } from 'class-transformer';
import { Equals, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ID_TYPES } from './identity-checks.service';

// Bodies for the person record's panels (PPL-34 identity checks, PPL-45 work authorisations) and the person's own
// disability declaration (PPL-38); possible same person and merges (PPL-36, PPL-37).

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const WORK_AUTH_KINDS = ['employment_visa', 'residence_visa', 'work_permit', 'national_id'] as const;

export class AttestDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class ReverifyDto {
  @IsIn(ID_TYPES)
  typeKey!: string;
}

export class WorkAuthDto {
  @IsIn(WORK_AUTH_KINDS)
  kind!: string;

  @Matches(/^[A-Z]{2}$/, { message: 'country is an ISO 3166-1 alpha-2 code' })
  country!: string;

  @Matches(/^[A-Za-z0-9][A-Za-z0-9 /-]{3,29}$/, { message: 'Enter the number as printed: 4 to 30 letters, digits, spaces, dashes or slashes.' })
  number!: string;

  @IsOptional() @IsString() @MaxLength(120)
  sponsor?: string;

  @IsOptional() @IsString() @MaxLength(120)
  occupation?: string;

  @IsOptional() @IsDateString({ strict: true }) @Matches(DATE, { message: 'issuedOn is a date (YYYY-MM-DD)' })
  issuedOn?: string;

  @IsDateString({ strict: true }) @Matches(DATE, { message: 'expiresOn is a date (YYYY-MM-DD)' })
  expiresOn!: string;
}

/** The RPwD Act 2016 categories, grouped as the declaration form lists them. */
export const RPWD = ['Locomotor disability', 'Low vision', 'Blindness', 'Hard of hearing', 'Deaf', 'Specific learning disability', 'Autism spectrum disorder', 'Intellectual disability', 'Mental illness', 'Multiple disabilities', 'Other benchmark disability'] as const;

export class DisabilityDto {
  @Equals(true, { message: 'Agree to how the company uses the declaration first.' })
  consent!: boolean;

  @IsIn(['yes', 'no', 'skip'])
  answer!: 'yes' | 'no' | 'skip';

  @IsOptional() @IsIn(RPWD)
  category?: string;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  percent?: number;

  @IsOptional() @IsUUID()
  certificateDocumentId?: string;

  @IsOptional() @IsString() @MaxLength(500)
  adjustments?: string;
}

export class PersonPairDto {
  @IsUUID()
  personId!: string;

  @IsUUID()
  intoPersonId!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

class MergeKeepDto {
  @IsIn(['a', 'b'])
  name!: 'a' | 'b';

  @IsIn(['a', 'b'])
  email!: 'a' | 'b';

  @IsIn(['a', 'b'])
  phone!: 'a' | 'b';
}

export class MergeDto {
  @IsUUID()
  personId!: string;

  @IsUUID()
  intoPersonId!: string;

  @ValidateNested() @Type(() => MergeKeepDto)
  keep!: MergeKeepDto;

  @IsString() @MinLength(1, { message: 'Enter why you are merging. It goes to the link log.' }) @MaxLength(1000)
  note!: string;
}

export class UnmergeDto {
  @IsString() @MinLength(1, { message: 'Enter a reason for the audit log.' }) @MaxLength(1000)
  note!: string;
}
