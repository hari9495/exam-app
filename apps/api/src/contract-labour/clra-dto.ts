import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
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
