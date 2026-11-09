import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

// HIR-09 / HIR-29 inputs. Money is whole rupees or rupees and paise as text (never a float); dates are ISO dates.
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class OfferPayDto {
  @IsUUID() templateVersionId!: string;
  @Matches(MONEY, { message: 'Give the fixed CTC in rupees.' }) annualCtc!: string;
  @IsOptional() @Matches(MONEY, { message: 'Give the variable pay in rupees.' }) variablePay?: string;
  @IsOptional() @Matches(MONEY, { message: 'Give the joining bonus in rupees.' }) joiningBonus?: string;
  @IsOptional() @IsInt() @Min(1) @Max(60) clawbackMonths?: number;
  @IsUUID() locationId!: string;
}

export class OfferPreviewDto extends OfferPayDto {
  @IsUUID() entryId!: string;
}

export class OfferDraftDto extends OfferPayDto {
  @IsDateString({ strict: true }) startDate!: string;
  @IsDateString({ strict: true }) expiresAt!: string;
  @IsOptional() @IsIn(['offer', 'loi']) letterKind?: 'offer' | 'loi';
  @IsOptional() @IsUUID() templateId?: string;
  /** Start with the company's conditions (HIR-29, setting hiring.offer.default_conditions). */
  @IsOptional() @IsBoolean() addConditions?: boolean;
}

export class OfferCreateDto extends OfferDraftDto {
  @IsUUID() entryId!: string;
}

export class OfferReviseDto extends OfferDraftDto {
  /** The version the change starts from (optimistic concurrency: someone else's revision wins, this one is refused). */
  @IsInt() @Min(0) fromVersion!: number;
  @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}

export class OfferConditionDto {
  @trim() @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsDateString({ strict: true }) dueOn!: string;
}

export class OfferConditionMetDto {
  @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}

export class OfferConditionWaiveDto {
  @trim() @IsString() @MinLength(3, { message: 'Give the reason for waiving it.' }) @MaxLength(500) reason!: string;
}
