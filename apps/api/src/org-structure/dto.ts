import { BadRequestException } from '@nestjs/common';
import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
  validateSync,
} from 'class-validator';
import { SCOPE_ORDER } from './settings-registry';

// Request bodies for P01 organisation records. Create and edit share one body (an edit sends the whole
// record); `code` left out is generated on create and kept on edit (YX-ORG-05).

const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/;
const CODE_MESSAGE = 'code is up to 30 letters, digits, - or _';
/** null clears an optional field; undefined leaves it out. */
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class AddressDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  lines!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city!: string;

  /** ISO 3166-2, e.g. IN-KA. */
  @Matches(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, { message: 'state is an ISO 3166-2 code such as IN-KA' })
  state!: string;

  @Nullable()
  @Matches(/^[A-Za-z0-9 -]{3,10}$/, { message: 'postalCode is 3–10 letters or digits' })
  postalCode?: string | null;

  /** ISO 3166-1 alpha-2. */
  @Matches(/^[A-Z]{2}$/, { message: 'country is an ISO 3166-1 code such as IN' })
  country!: string;
}

export class LegalEntityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Matches(/^[A-Za-z0-9][A-Za-z0-9 &.-]{0,29}$/, { message: 'shortName is up to 30 letters, digits, spaces, &, . or -' })
  shortName!: string;

  /** Fixed at creation with the data region (YX-ORG-30). */
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fyStartMonth?: number;

  @Nullable()
  @ValidateNested()
  @Type(() => AddressDto)
  registeredAddress?: AddressDto | null;

  @IsOptional()
  @IsIn(['IN', 'ME-AE', 'ME-SA', 'EU', 'US', 'SG'])
  dataRegion?: string;
}

/** Confidential identifiers (P02 §4.4): set apart from the entity, with step-up. null removes one. */
export class LegalEntityStatutoryDto {
  @Nullable()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'PAN is 5 letters, 4 digits, 1 letter' })
  pan?: string | null;

  @Nullable()
  @Matches(/^[A-Z]{4}[0-9]{5}[A-Z]$/, { message: 'TAN is 4 letters, 5 digits, 1 letter' })
  tan?: string | null;

  @Nullable()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, { message: 'GSTIN is 15 characters: state code, PAN, entity number, Z, check' })
  gstin?: string | null;

  @Nullable()
  @Matches(/^([LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}|[A-Z]{3}-[0-9]{4})$/, { message: 'Enter a 21-character CIN or an LLPIN such as AAB-1234' })
  cin?: string | null;
}

export class GeofenceDto {
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsInt()
  @Min(10)
  @Max(5000)
  radiusM!: number;
}

export class LocationDto {
  /** Fixed once created. */
  @IsUUID()
  legalEntityId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Matches(CODE, { message: CODE_MESSAGE })
  code?: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;

  /** IANA, e.g. Asia/Kolkata (YX-ORG-02). */
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @Nullable()
  @IsString()
  @MaxLength(40)
  minWageZone?: string | null;

  @Nullable()
  @ValidateNested()
  @Type(() => GeofenceDto)
  geofence?: GeofenceDto | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(43, { each: true })
  ipRanges?: string[];
}

// ---- structure masters (YX-ORG-15) ----

export const MASTER_KINDS = ['departments', 'designations', 'grades', 'employment-types', 'cost-centres'] as const;
export type MasterKind = (typeof MASTER_KINDS)[number];

export const EMPLOYMENT_CATEGORIES = ['permanent', 'probation', 'fixed_term', 'intern', 'apprentice', 'consultant', 'deployed_contractor', 'retired_reemployed'] as const;

class MasterBaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Matches(CODE, { message: CODE_MESSAGE })
  code?: string;
}

class ScopedMasterDto extends MasterBaseDto {
  /** Set = entity-only; null = shared across the company. */
  @Nullable()
  @IsUUID()
  ownerLegalEntityId?: string | null;

  /** A shared master limited to these entities; empty = all. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  appliesToEntities?: string[];
}

export class DepartmentDto extends ScopedMasterDto {
  @Nullable()
  @IsUUID()
  parentId?: string | null;

  /** P01 §4.3: the department head (implicit "Dept head @ department subtree" view, P02 YX-SEC-04). */
  @Nullable()
  @IsUUID()
  headEmployeeId?: string | null;

  @IsOptional()
  @IsBoolean()
  isDivision?: boolean;
}

export class DesignationDto extends ScopedMasterDto {
  @Nullable()
  @IsString()
  @MaxLength(100)
  jobFamily?: string | null;
}

export class GradeDto extends ScopedMasterDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  rank!: number;
}

export class EmploymentTypeDto extends ScopedMasterDto {
  @IsIn(EMPLOYMENT_CATEGORIES)
  category!: string;
}

export class CostCentreDto extends MasterBaseDto {
  /** Fixed once created. */
  @IsUUID()
  legalEntityId!: string;

  @Nullable()
  @IsUUID()
  parentId?: string | null;
}

export type AnyMasterDto = DepartmentDto | DesignationDto | GradeDto | EmploymentTypeDto | CostCentreDto;

const MASTER_DTO: Record<MasterKind, new () => AnyMasterDto> = {
  departments: DepartmentDto,
  designations: DesignationDto,
  grades: GradeDto,
  'employment-types': EmploymentTypeDto,
  'cost-centres': CostCentreDto,
};

/** The body for `kind`, validated exactly as the global ValidationPipe would (whitelist, no extras). */
export function masterBody(kind: MasterKind, body: unknown): AnyMasterDto {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('A JSON object is required');
  const dto = plainToInstance(MASTER_DTO[kind], body);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) {
    throw new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? { [e.property]: `${e.property} is not valid` })));
  }
  return dto;
}

export class MasterListQueryDto {
  /** Only masters a given entity may use (YX-ORG-15). */
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeArchived?: string;
}

// ---- grade pay ranges (P01 §4.3, P06) ----

const AMOUNT = { maxDecimalPlaces: 2 } as const;

export class PayRangeAmountsDto {
  @IsNumber(AMOUNT)
  @Min(0)
  @Max(1e12)
  min!: number;

  @IsNumber(AMOUNT)
  @Min(0)
  @Max(1e12)
  mid!: number;

  @IsNumber(AMOUNT)
  @Min(0)
  @Max(1e12)
  max!: number;
}

export class PayRangeDto extends PayRangeAmountsDto {
  @IsUUID()
  legalEntityId!: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validFrom is a date (YYYY-MM-DD)' })
  validFrom!: string;

  @Nullable()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validTo is a date (YYYY-MM-DD)' })
  validTo?: string | null;
}

export class PayRangeQueryDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

// ---- scoped settings (P01 §4.6) ----

export class SettingDto {
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
  @MaxLength(100)
  key!: string;

  @IsIn(SCOPE_ORDER)
  scopeType!: string;

  /** Omitted for scope 'tenant'. */
  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsString()
  @MaxLength(100)
  value!: string;

  /** Dated keys only. */
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validFrom is a date (YYYY-MM-DD)' })
  validFrom?: string;
}

export class ResolveSettingQueryDto {
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
  @MaxLength(100)
  key!: string;

  /** Required for dated keys (YX-ORG-18). */
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'asOf is a date (YYYY-MM-DD)' })
  asOf?: string;

  @IsOptional() @IsUUID() legalEntityId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() employmentTypeId?: string;
  @IsOptional() @IsUUID() gradeId?: string;
  @IsOptional() @IsUUID() designationId?: string;
  /** Brings in the employee's assignment in force on asOf (today for plain keys), YX-ORG-18. */
  @IsOptional() @IsUUID() employeeId?: string;
}
