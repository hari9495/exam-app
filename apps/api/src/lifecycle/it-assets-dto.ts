import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { GSTIN } from '../org-structure/org-validation';

// IT assets part 3 request bodies: the IT and Admin supplier list (answer 2716) and asset contracts (answer 2717).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const NO_TAGS = { message: 'leave out < and >' };

export class SupplierContactDto {
  @trim()
  @IsString()
  @Length(2, 100)
  @Matches(/^[^<>]*$/, NO_TAGS)
  name!: string;

  @IsOptional()
  @trim()
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @IsOptional()
  @trim()
  @Matches(/^\+?[0-9][0-9 ()-]{5,19}$/, { message: 'phone is 6 to 20 digits, spaces, brackets or dashes' })
  phone?: string | null;
}

export class SupplierDto {
  @trim()
  @IsString()
  @Length(2, 150)
  @Matches(/^[^<>]*$/, NO_TAGS)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value))
  @Matches(GSTIN, { message: 'GSTIN is 15 characters: state code, PAN, entity number, Z, check' })
  gstin?: string | null;

  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => SupplierContactDto)
  contacts!: SupplierContactDto[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  @Matches(/^[^<>]*$/, NO_TAGS)
  notes?: string | null;

  /** Retired suppliers leave the pickers; assets and contracts keep them. */
  @IsOptional()
  @IsBoolean()
  retired?: boolean;

  @IsOptional()
  @IsInt()
  version?: number;
}

export const CONTRACT_KINDS = ['amc', 'support', 'lease', 'insurance', 'subscription', 'other'] as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

/** Answer 2717: an asset contract. */
export class ContractDto {
  @IsIn(CONTRACT_KINDS)
  kind!: (typeof CONTRACT_KINDS)[number];

  @trim()
  @IsString()
  @Length(1, 60)
  @Matches(/^[^<>]*$/, NO_TAGS)
  number!: string;

  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @Matches(ISO)
  startsOn!: string;

  @IsInt()
  @Min(1)
  @Max(120)
  months!: number;

  @IsIn(['tacit', 'express'])
  renewal!: 'tacit' | 'express';

  @IsInt()
  @Min(0)
  @Max(365)
  noticeDays!: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  @Matches(/^[^<>]*$/, NO_TAGS)
  supportHours?: string | null;

  @IsOptional()
  @Matches(MONEY)
  value?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  assetCap?: number | null;

  /** The covered assets the caller sees; links to assets they cannot see are kept as they are. */
  @IsArray()
  @ArrayMaxSize(10000)
  @IsUUID('all', { each: true })
  assetIds!: string[];

  @IsOptional()
  @IsInt()
  version?: number;
}

/** Answer 2718: a software licence. */
export class LicenceDto {
  @trim()
  @IsString()
  @Length(1, 120)
  @Matches(/^[^<>]*$/, NO_TAGS)
  software!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  @Matches(/^[^<>]*$/, NO_TAGS)
  softwareVersion?: string | null;

  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsInt()
  @Min(1)
  @Max(100000)
  seats!: number;

  /** Empty: it does not expire. */
  @IsOptional()
  @Matches(ISO)
  expiresOn?: string | null;

  @IsOptional()
  @Matches(MONEY)
  cost?: string | null;

  @IsBoolean()
  allowOverQuota!: boolean;

  @IsOptional()
  @IsInt()
  version?: number;
}

/** Answer 2718: a seat goes to a person (a current employee) or a device (an asset), never both. */
export class LicenceSeatDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;
}

export class FreeSeatDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  @Matches(/^[^<>]*$/, NO_TAGS)
  reason?: string | null;
}

/** Answer 2715: IT makes an in-stock asset bookable (or not). */
export class BookableDto {
  @IsBoolean()
  bookable!: boolean;
}

/** Answer 2715: an employee books a bookable asset for themselves, once or with daily or weekly repeats. */
export class BookingDto {
  @IsUUID()
  assetId!: string;

  @Matches(ISO)
  startsOn!: string;

  @Matches(ISO)
  endsOn!: string;

  @IsIn(['none', 'daily', 'weekly'])
  repeat!: 'none' | 'daily' | 'weekly';

  /** The last day a repeat may start on (up to 3 months after the first day). */
  @IsOptional()
  @Matches(ISO)
  until?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  @Matches(/^[^<>]*$/, NO_TAGS)
  purpose?: string | null;
}

/** Answer 2715: the "free between" search. */
export class BookingSearchDto {
  @Matches(ISO)
  from!: string;

  @Matches(ISO)
  to!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

/** Answer 2715: a cancel (the person: reason optional; IT: reason needed) or a decline (reason needed). */
export class BookingReasonDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  @Matches(/^[^<>]*$/, NO_TAGS)
  reason?: string | null;

  /** Also the later bookings of the same repeat. */
  @IsOptional()
  @IsBoolean()
  series?: boolean;
}

export class BookingHandOverDto {
  @trim()
  @IsString()
  @Length(2, 200)
  @Matches(/^[^<>]*$/, NO_TAGS)
  condition!: string;
}
