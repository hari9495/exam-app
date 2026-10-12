import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// Expenses batch E1 request bodies (M05-BUILD-DESIGN §18 "Setup"). Amounts travel as decimal strings.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

export class CategoryDto {
  @Matches(/^[a-z][a-z0-9_]{1,29}$/, { message: 'Use 2–30 lower-case letters, digits and _ for the code.' })
  code!: string;

  @trim()
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsIn(['spend', 'mileage', 'per_diem', 'company_paid_only'])
  kind!: 'spend' | 'mileage' | 'per_diem' | 'company_paid_only';

  @IsOptional()
  @Matches(MONEY)
  receiptAbove?: string | null;

  @IsBoolean()
  gstEligible!: boolean;

  @IsOptional()
  @IsIn(['food_beverages', 'rent_a_cab', 'club_membership', 'travel_benefits_holiday', 'beauty_health', 'motor_vehicle', 'other_blocked'])
  itcBlockedReason?: string | null;

  @IsIn(['never', 'always', 'above_limit'])
  taxable!: 'never' | 'always' | 'above_limit';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(40)
  ledgerCode?: string | null;

  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class TierDto {
  @trim()
  @IsString()
  @Length(2, 60)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  rank!: number;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string | null;

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  cities!: string[];

  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class RuleDto {
  @Matches(/^[a-z][a-z0-9_]{1,29}$/)
  categoryCode!: string;

  @IsOptional()
  @IsUUID()
  tierId?: string | null;

  @IsOptional()
  @Matches(MONEY)
  perLine?: string | null;

  @IsOptional()
  @Matches(MONEY)
  perDay?: string | null;

  @IsOptional()
  @Matches(MONEY)
  perTrip?: string | null;

  @IsOptional()
  @Matches(MONEY)
  perMonth?: string | null;

  @IsIn(['justify_and_approve', 'block'])
  overLimit!: 'justify_and_approve' | 'block';

  @IsOptional()
  @IsBoolean()
  needsJustification?: boolean;
}

export class PolicyDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  /** A P19 condition group over the employee's job record; null = everyone. */
  @IsOptional()
  @IsObject()
  appliesIf?: Record<string, unknown> | null;

  @IsInt()
  @Min(1)
  @Max(1000)
  priority!: number;

  @Matches(ISO)
  validFrom!: string;

  @IsOptional()
  @Matches(ISO)
  validTo?: string | null;

  @IsIn(['active', 'retired'])
  status!: 'active' | 'retired';

  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules!: RuleDto[];

  @IsOptional()
  @IsInt()
  version?: number;
}

export class NewVersionDto extends PolicyDto {
  @IsInt()
  declare version: number;
}

export class MileageRateDto {
  @IsIn(['two_wheeler', 'car', 'ev_two_wheeler', 'ev_car', 'other'])
  vehicle!: string;

  @Matches(/^\d{1,6}(\.\d{1,2})?$/)
  ratePerKm!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  monthlyKmCap?: number | null;

  @Matches(ISO)
  validFrom!: string;
}

export class PerDiemRateDto {
  @IsOptional()
  @IsUUID()
  tierId?: string | null;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string | null;

  @Matches(MONEY)
  ratePerDay!: string;

  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsIn(['full', 'half_after_hours'])
  partialDayRule!: 'full' | 'half_after_hours';

  @IsOptional()
  @IsObject()
  mealsDeduction?: Record<string, number>;

  @Matches(ISO)
  validFrom!: string;
}

export class GstRegistrationDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @Length(15, 15)
  gstin!: string;

  @Matches(ISO)
  validFrom!: string;
}

export class EndDto {
  @Matches(ISO)
  validTo!: string;
}

export class LimitsQueryDto {
  @IsOptional()
  @Matches(ISO)
  on?: string;
}

