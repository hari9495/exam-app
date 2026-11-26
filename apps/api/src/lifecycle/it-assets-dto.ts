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
