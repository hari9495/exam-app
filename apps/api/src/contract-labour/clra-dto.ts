import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIdentityCard, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ESIC_CODE, LIN, PF_CODE } from './clra-rules';

// Contract labour CL-1 request bodies. A licence comes as a multipart form (the licence copy is the file), so its numbers
// and the states arrive as text and are turned into numbers and a list here.
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ContractorDto {
  @trim() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(200) work!: string;
  @IsOptional() @trim() @IsEmail() @MaxLength(254) contactEmail?: string | null;
  @IsOptional() @upper() @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'A PAN has 10 characters, like ABCDE1234F.' }) pan?: string | null;
  @IsOptional() @upper() @IsString() @MaxLength(15) gstin?: string | null;
  @IsOptional() @upper() @Matches(PF_CODE, { message: 'A PF code looks like TNMAS0012345000.' }) pfCode?: string | null;
  @IsOptional() @trim() @Matches(ESIC_CODE, { message: 'An ESIC code has 17 digits.' }) esicCode?: string | null;
  @IsOptional() @trim() @Matches(LIN, { message: 'A LIN has 10 digits.' }) lin?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class LicenceDto {
  @IsUUID() locationId!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(40) licenceNo!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(200) scope!: string;
  /** "IN-TN,IN-KA" in the form. */
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @Matches(/^IN-[A-Z]{2}$/, { each: true })
  states!: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) maxWorkers!: number;
  @Matches(DAY) validFrom!: string;
  @Matches(DAY) validTo!: string;
}

/** A renewal: the same establishment; a new number is allowed (some states issue one). */
export class RenewalDto {
  @trim() @IsString() @MinLength(1) @MaxLength(40) licenceNo!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) maxWorkers!: number;
  @Matches(DAY) validFrom!: string;
  @Matches(DAY) validTo!: string;
}

export class RejectLicenceDto {
  @trim() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

class ClraSettingChangeDto {
  @IsString() @MaxLength(80) key!: string;
  @IsString() @MaxLength(200) value!: string;
}
export class SaveClraSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ClraSettingChangeDto)
  changes!: ClraSettingChangeDto[];
}

/* ---------------- CL-2 contract workers ---------------- */


export class WorkerDto {
  @IsUUID() contractorId!: string;
  @IsUUID() locationId!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(100) givenName!: string;
  @IsOptional() @trim() @IsString() @MaxLength(100) familyName?: string | null;
  @Matches(DAY) dob!: string;
  /** Answer 636: read once to keep the last 4 digits and a keyed hash; never stored. */
  @Matches(/^[2-9][0-9]{11}$/, { message: 'An Aadhaar number has 12 digits.' }) @IsIdentityCard('IN', { message: 'That Aadhaar number fails its check digit.' }) aadhaar!: string;
  @IsIn(['unskilled', 'semi_skilled', 'skilled', 'highly_skilled']) skill!: 'unskilled' | 'semi_skilled' | 'skilled' | 'highly_skilled';
  @IsOptional() @Matches(/^\d{1,9}(\.\d{1,2})?$/, { message: 'Enter the wage in rupees.' }) wage?: string | null;
  @IsOptional() @trim() @Matches(/^[0-9]{12}$/, { message: 'A UAN has 12 digits.' }) uan?: string | null;
  @IsOptional() @trim() @Matches(/^[0-9]{10}$/, { message: 'An ESI IP number has 10 digits.' }) esicIp?: string | null;
  @Matches(DAY) fromOn!: string;
  @IsOptional() @Matches(DAY) toOn?: string | null;
}

export class ApproveWorkerDto {
  @IsInt() @Min(1) version!: number;
  @IsOptional() @Matches(DAY) inductionOn?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(120) inductionBy?: string | null;
}

export class ReleaseWorkerDto {
  @IsInt() @Min(1) version!: number;
  @Matches(DAY) on!: string;
  @trim() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

/** Answer 675: a contractor's work order. */
export class WorkOrderDto {
  @trim() @IsString() @MinLength(1) @MaxLength(40) number!: string;
  @Matches(DAY) fromOn!: string;
  @Matches(DAY) toOn!: string;
  @IsInt() @Min(1) @Max(100000) headcount!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('all', { each: true }) locationIds!: string[];
  @IsOptional() @IsInt() @Min(1) version?: number;
}
