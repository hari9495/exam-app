import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// Expenses batch E2 request bodies (M05-BUILD-DESIGN §18 "Claims"). Amounts travel as decimal strings.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));

export class ClaimDto {
  @trim()
  @IsString()
  @Length(2, 150)
  title!: string;

  /** E4: the approved trip the claim belongs to (its advance settles the claim first). null unlinks it. */
  @IsOptional()
  @IsUUID()
  tripId?: string | null;

  /** E4: a paid standing imprest the claim settles. null unlinks it. */
  @IsOptional()
  @IsUUID()
  advanceId?: string | null;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class MileageDto {
  @IsIn(['two_wheeler', 'car', 'ev_two_wheeler', 'ev_car', 'other'])
  vehicle!: string;

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(5000)
  km!: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  from?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  to?: string;
}

export class MealsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  breakfast?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  lunch?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  dinner?: number;
}

export class PerDiemDto {
  @IsInt()
  @Min(0)
  @Max(60)
  fullDays!: number;

  @IsInt()
  @Min(0)
  @Max(2)
  partialDays!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => MealsDto)
  meals?: MealsDto;
}

export class GstDto {
  @IsOptional()
  @upper()
  @Matches(GSTIN, { message: 'The supplier GSTIN has 15 characters: state code, PAN, entity number, Z and a check character.' })
  supplierGstin?: string | null;

  @IsOptional()
  @upper()
  @IsString()
  @MaxLength(40)
  invoiceNo?: string | null;

  @IsOptional()
  @Matches(ISO)
  invoiceDate?: string | null;

  @IsOptional()
  @Matches(/^\d{2}$/)
  placeOfSupply?: string | null;

  @IsOptional()
  @Matches(MONEY)
  taxableValue?: string | null;

  @IsOptional()
  @Matches(MONEY)
  cgst?: string | null;

  @IsOptional()
  @Matches(MONEY)
  sgst?: string | null;

  @IsOptional()
  @Matches(MONEY)
  igst?: string | null;

  @IsOptional()
  @Matches(MONEY)
  cess?: string | null;

  @IsOptional()
  @upper()
  @Matches(GSTIN, { message: 'The billed-to GSTIN has 15 characters.' })
  billedToGstin?: string | null;
}

export class LineDto {
  @Matches(/^[a-z][a-z0-9_]{1,29}$/)
  categoryCode!: string;

  @Matches(ISO)
  spentOn!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  merchant?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  city?: string | null;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  @IsIn(['personal', 'company_card', 'company_paid'])
  payMode!: 'personal' | 'company_card' | 'company_paid';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  /** Spend lines: what the bill says. Mileage and per diem are worked out and never typed (YX-EXP-03). */
  @IsOptional()
  @Matches(MONEY)
  amount?: string;

  @IsOptional()
  @IsBoolean()
  selfDeclared?: boolean;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  justification?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => MileageDto)
  mileage?: MileageDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PerDiemDto)
  perDiem?: PerDiemDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GstDto)
  gst?: GstDto;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class SubmitDto {
  @IsInt()
  version!: number;
}

export class ApproveAmountDto {
  @Matches(MONEY)
  amount!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class DecideDto {
  @IsIn(['approve', 'reject', 'send_back'])
  decision!: 'approve' | 'reject' | 'send_back';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class FlagDto {
  @IsIn(['clear', 'confirm'])
  decision!: 'clear' | 'confirm';

  @trim()
  @IsString()
  @Length(3, 300)
  note!: string;
}

export class ListQueryDto {
  @IsOptional()
  @IsIn(['mine', 'approvals', 'review', 'scope'])
  view?: 'mine' | 'approvals' | 'review' | 'scope';
}

export class ReceiptQueryDto {
  @IsOptional()
  @IsUUID()
  lineId?: string;
}

