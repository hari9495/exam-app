import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// Platform console inputs (P14 §6 flow 5, P02 Q8). Every staff action that touches a company carries a reason
// (YX-CONSOLE-02).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const Reason = (min: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min, { message: `Give a reason of at least ${min} characters` })(target, key);
  MaxLength(500)(target, key);
};

export const LIFECYCLE_STATES = ['trial', 'active', 'suspended', 'closed'] as const;
export const LIFECYCLE_ACTIONS = ['activate', 'suspend', 'reinstate', 'close'] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export class CompaniesQueryDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(LIFECYCLE_STATES)
  lifecycle?: string;
}

export class CreateCompanyDto {
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  /** The company code people type at sign-in. */
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/, { message: 'The company code is lowercase letters, digits and hyphens (up to 50)' })
  slug!: string;

  @trim()
  @IsEmail()
  @MaxLength(320)
  adminEmail!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  adminName!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one product' })
  @ArrayMaxSize(10)
  @ArrayUnique()
  @Matches(/^[a-z][a-z0-9_]{1,31}$/, { each: true })
  products!: string[];
}

export class LifecycleDto {
  @IsIn(LIFECYCLE_ACTIONS)
  action!: LifecycleAction;

  @Reason(5)
  reason!: string;
}

export class ExtendTrialDto {
  @IsInt()
  @Min(1)
  @Max(14)
  days!: number;

  @Reason(5)
  reason!: string;
}

export class PriceDto {
  @IsIn(['INR', 'USD'])
  currency!: string;

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(1_000_000)
  unitPrice!: number;

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10_000_000)
  minimumMonthly!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validFrom is a date such as 2027-01-01' })
  validFrom!: string;

  @Reason(5)
  reason!: string;
}

export class SupportRequestDto {
  @Reason(10)
  reason!: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/, { message: 'A ticket number is letters, digits and hyphens' })
  ticket?: string;

  @IsInt()
  @Min(1)
  @Max(72)
  hours!: number;
}

export class SupportApproveDto {
  /** Shorter than asked if the company wants; never longer. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  hours?: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SupportNoteDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SupportListQueryDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class PlatformAuditQueryDto {
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  /** Include the console's own cross-company reads. */
  @IsOptional()
  @IsIn(['true', 'false'])
  reads?: string;
}
