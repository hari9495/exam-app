import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ID_TYPES } from './identity-checks.service';

// Bodies for the person record's panels (PPL-34 identity checks, PPL-45 work authorisations).

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
