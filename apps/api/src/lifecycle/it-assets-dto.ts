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
