import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Staffing desk slice 1 request bodies. Money is rupees as text ("1200.50"), turned into paise exactly by the service.
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;
const MULT = ['1', '1.25', '1.5', '1.75', '2', '2.5', '3'];

export class ClientDto {
  @trim() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @trim() @IsString() @MaxLength(200) legalName?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(15) gstin?: string | null;
  @IsString() @Matches(/^IN-[A-Z]{2}$/) state!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(500) billingAddress!: string;
  @IsOptional() @IsIn(['onboarding', 'active', 'on_hold']) status?: 'onboarding' | 'active' | 'on_hold';
  @IsOptional() @IsUUID() accountManagerUserId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(180) paymentTermsDays?: number | null;
  @IsOptional() @Matches(DAY) contractStart?: string | null;
  @IsOptional() @Matches(DAY) contractEnd?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(365) noticeDays?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(60) slaFirstSubmissionDays?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(60) slaFeedbackDays?: number | null;
}

export class UpdateClientDto extends ClientDto {
  @IsInt() @Min(1) version!: number;
}

export class ClientContactDto {
  @trim() @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(120) role!: string;
  @trim() @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @trim() @Matches(/^\+?[0-9 ]{8,16}$/) phone?: string | null;
  @IsOptional() @IsBoolean() billing?: boolean;
}

export class RateLineDto {
  @trim() @IsString() @MinLength(1) @MaxLength(120) role!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(200) skill!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(120) location!: string;
  @IsIn(['hour', 'day', 'month']) unit!: 'hour' | 'day' | 'month';
  @IsString() @Matches(MONEY) billRate!: string;
  @IsString() @Matches(MONEY) payRate!: string;
  @IsOptional() @IsIn(MULT) ot?: string;
  @IsOptional() @IsIn(MULT) holiday?: string;
  @Matches(DAY) validFrom!: string;
  @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string | null;
}

export class RateChangeDto {
  @Matches(DAY) validFrom!: string;
  @IsString() @Matches(MONEY) billRate!: string;
  @IsString() @Matches(MONEY) payRate!: string;
  @IsOptional() @IsIn(MULT) ot?: string;
  @IsOptional() @IsIn(MULT) holiday?: string;
  @trim() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class StaffingSettingChangeDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.]{2,79}$/) key!: string;
  @IsString() @MaxLength(40) value!: string;
}

export class SaveStaffingSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => StaffingSettingChangeDto)
  changes!: StaffingSettingChangeDto[];
}

export class InvoiceSeriesDto {
  @IsUUID() legalEntityId!: string;
  @trim() @IsString() @MaxLength(15) gstin!: string;
  @Matches(/^\d{4}-\d{2}$/) financialYear!: string;
  // GST invoice numbers: at most 16 characters in all, letters, digits, '-' and '/' (CGST Rules r.46(b)); the prefix
  // leaves at least 3 for the number (the service checks the whole length).
  @trim() @Matches(/^[A-Za-z0-9/-]{1,13}$/) prefix!: string;
  @IsInt() @Min(1) @Max(99_999_999) nextNumber!: number;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
