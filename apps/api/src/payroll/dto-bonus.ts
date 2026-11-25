import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min, ValidateIf } from 'class-validator';

// PAY-24 statutory bonus request bodies. Amounts are rupees as decimal strings (exact, never floats); every write carries
// the computation's version, so two people changing it at once get a clear conflict instead of a lost change.
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DAY = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const MONEY = /^\d{1,13}(\.\d{1,2})?$/;
const RATE = /^\d{1,2}(\.\d{1,2})?$/;

export class BonusCreateDto {
  @IsUUID()
  legalEntityId!: string;

  /** The first day of the accounting year (yyyy-mm-01). */
  @Matches(DAY, { message: 'yearStart is the first day of the accounting year (yyyy-mm-01).' })
  yearStart!: string;
}

class Versioned {
  @IsInt()
  @Min(1)
  version!: number;
}

export class BonusVersionDto extends Versioned {}

export class BonusPatchDto extends Versioned {
  /** The available surplus from the year's accounts (null clears it). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(MONEY, { message: 'The available surplus is an amount in rupees.' })
  availableSurplus?: string | null;

  /** Set-on carried from before YukthiX (first computation of the entity only). */
  @IsOptional()
  @Matches(MONEY, { message: 'The set-on brought in is an amount in rupees.' })
  openingSetOn?: string;

  @IsOptional()
  @Matches(MONEY, { message: 'The set-off brought in is an amount in rupees.' })
  openingSetOff?: string;

  /** A rate above what the surplus supports (percent); null goes back to what the surplus supports. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(RATE, { message: 'The bonus rate is a percentage such as 8.33.' })
  rate?: string | null;
}

export class BonusRowDto extends Versioned {
  @Matches(MONEY, { message: 'Puja or customary bonus paid is an amount in rupees.' })
  pujaPaid!: string;

  @Matches(MONEY, { message: 'The loss from misconduct is an amount in rupees.' })
  misconductLoss!: string;

  @IsBoolean()
  disqualified!: boolean;

  @IsOptional()
  @trim()
  @IsString()
  @Length(5, 300, { message: 'Give a reason of 5 to 300 characters.' })
  reason?: string;
}

export class BonusReturnDto extends Versioned {
  @trim()
  @IsString()
  @Length(5, 500, { message: 'Say what needs to change, in 5 to 500 characters.' })
  reason!: string;
}

export class BonusSendDto extends Versioned {
  /** A draft off-cycle bonus run of the same legal entity; without it a new one is made this month. */
  @IsOptional()
  @IsUUID()
  runId?: string;
}

/** Form C as a spreadsheet (CSV, the default) or a PDF. */
export class BonusFormCQueryDto {
  @IsOptional()
  @IsIn(['csv', 'pdf'], { message: 'Form C downloads as csv or pdf.' })
  format?: 'csv' | 'pdf';
}
