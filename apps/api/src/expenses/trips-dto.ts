import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// Expenses batch E4 request bodies (M05-BUILD-DESIGN §18 "Trips", "Advances"). Amounts travel as decimal strings.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const RATE = /^\d{1,10}(\.\d{1,8})?$/;

export class LegDto {
  @trim()
  @IsString()
  @Length(2, 60)
  fromCity!: string;

  @trim()
  @IsString()
  @Length(2, 60)
  toCity!: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  @Matches(ISO)
  departOn!: string;

  @IsIn(['air', 'rail', 'road', 'other'])
  mode!: 'air' | 'rail' | 'road' | 'other';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  stayNights?: number;
}

export class TripDto {
  @trim()
  @IsString()
  @Length(3, 300)
  purpose!: string;

  @Matches(ISO)
  fromOn!: string;

  @Matches(ISO)
  toOn!: string;

  @Matches(MONEY)
  estimate!: string;

  @IsOptional()
  @Matches(MONEY)
  advanceRequested?: string;

  /** E5: a forex advance (YX-EXP-15) is asked for in its own currency. */
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  advanceCurrency?: string;

  @IsOptional()
  @IsBoolean()
  bookingNeeded?: boolean;

  @ValidateNested({ each: true })
  @Type(() => LegDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  legs!: LegDto[];

  @IsOptional()
  @IsInt()
  version?: number;
}

export class VersionDto {
  @IsInt()
  version!: number;
}

export class BookingDto {
  @IsIn(['ticket', 'hotel', 'cab', 'visa', 'other'])
  kind!: 'ticket' | 'hotel' | 'cab' | 'visa' | 'other';

  @trim()
  @IsString()
  @Length(2, 150)
  title!: string;

  @Matches(MONEY)
  amount!: string;

  @IsIn(['company', 'employee'])
  paidBy!: 'company' | 'employee';
}

export class PartnerBookingDto {
  @IsInt()
  @Min(1)
  @Max(20)
  legSeq!: number;
}

export class AdvanceDto {
  @trim()
  @IsString()
  @Length(3, 300)
  purpose!: string;

  @Matches(MONEY)
  amount!: string;
}

export class AdvanceAmountDto {
  @Matches(MONEY)
  amount!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class PayAdvanceDto {
  @Matches(ISO)
  paidOn!: string;

  @trim()
  @IsString()
  @Length(2, 80)
  ref!: string;

  /** A forex advance: the rate it was loaded at (pay currency per unit); the company rate otherwise. */
  @IsOptional()
  @Matches(RATE)
  fxRate?: string;

  @IsInt()
  version!: number;
}

export class ReturnDto {
  @Matches(MONEY)
  amount!: string;

  @Matches(ISO)
  on!: string;

  @trim()
  @IsString()
  @Length(2, 80)
  ref!: string;

  /** A forex advance: the rate the money came back at; the company rate for the day otherwise. */
  @IsOptional()
  @Matches(RATE)
  fxRate?: string;
}

export class CloseTripDto {
  @trim()
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class TripListDto {
  @IsOptional()
  @IsIn(['mine', 'approvals', 'scope', 'desk'])
  view?: 'mine' | 'approvals' | 'scope' | 'desk';
}

export class AdvanceListDto {
  @IsOptional()
  @IsIn(['mine', 'approvals', 'scope', 'payout'])
  view?: 'mine' | 'approvals' | 'scope' | 'payout';
}
