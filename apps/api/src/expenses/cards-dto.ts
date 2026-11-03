import { Transform, plainToInstance } from 'class-transformer';
import { IsBoolean, IsObject, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { DATE_FORMATS, type AmountMode, type DateFormat } from './card-statement';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** The mapping arrives as JSON text in the multipart form: parsed here into the class, then validated. */
const mappingJson = () =>
  Transform(({ value }) => {
    try {
      const v = typeof value === 'string' ? JSON.parse(value) : value;
      return v && typeof v === 'object' && !Array.isArray(v) ? plainToInstance(CardMappingDto, v) : value;
    } catch {
      return value;
    }
  });
const BANK = /^[\p{L}\p{N} &.,()'-]{2,80}$/u;
const COLUMN = { message: 'A column name is up to 80 characters.' };

export class CardMappingDto {
  @IsString() @MinLength(1) @MaxLength(80, COLUMN) date!: string;
  @IsIn(DATE_FORMATS) dateFormat!: DateFormat;
  @IsString() @MinLength(1) @MaxLength(80, COLUMN) description!: string;
  @IsIn(['signed', 'split', 'indicator']) amountMode!: AmountMode;
  @IsOptional() @IsString() @MaxLength(80, COLUMN) amount?: string;
  @IsOptional() @IsIn(['credit', 'debit']) negativeIs?: 'credit' | 'debit';
  @IsOptional() @IsString() @MaxLength(80, COLUMN) debit?: string;
  @IsOptional() @IsString() @MaxLength(80, COLUMN) credit?: string;
  @IsOptional() @IsString() @MaxLength(80, COLUMN) indicator?: string;
  @IsOptional() @IsString() @MaxLength(80, COLUMN) card?: string;
  @IsOptional() @IsString() @MaxLength(80, COLUMN) merchant?: string;
  @IsOptional() @IsString() @MaxLength(80, COLUMN) currency?: string;
}

export class CardPreviewDto {
  @IsOptional()
  @trim()
  @Matches(BANK, { message: 'The bank name is 2 to 80 letters, numbers or spaces.' })
  bankName?: string;
}

export class CardImportDto {
  @trim()
  @Matches(BANK, { message: 'The bank name is 2 to 80 letters, numbers or spaces.' })
  bankName!: string;

  @mappingJson()
  @IsObject({ message: 'Map the columns first.' })
  @ValidateNested()
  mapping!: CardMappingDto;

  /** Import as the next version of the same bank's statement for the same period. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  replace?: boolean;
}

export class CardVersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class CardMatchDto extends CardVersionDto {
  @IsUUID()
  claimLineId!: string;
}

export class CardCloseDto extends CardVersionDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CardLinkDto {
  @IsUUID()
  employeeId!: string;

  @trim()
  @Matches(BANK, { message: 'The bank name is 2 to 80 letters, numbers or spaces.' })
  bankName!: string;

  @Matches(/^\d{4}$/, { message: 'Enter the last 4 digits of the card only.' })
  last4!: string;
}

export class CardPeopleDto {
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q!: string;
}

export class CardExplainDto extends CardVersionDto {
  @IsIn(['business', 'personal'])
  choice!: 'business' | 'personal';
}
