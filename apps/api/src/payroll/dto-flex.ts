import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const MONEY = /^\d{1,7}(\.\d{1,2})?$/;
const YEAR = /^\d{4}-\d{2}$/;

/** B8/E5 (answer 2406): one flexible component of the company's list (Settings 4.11). */
export class FlexComponentDto {
  @trim()
  @Matches(/^[a-z][a-z0-9_]{1,29}$/, { message: 'The code is 2 to 30 small letters, digits or underscores, starting with a letter.' })
  code!: string;

  @trim()
  @IsString()
  @Length(2, 80)
  name!: string;

  /** The monthly entitlement in rupees, above zero. */
  @Matches(MONEY, { message: 'The monthly amount is rupees with up to 2 decimals.' })
  monthlyAmount!: string;

  @IsBoolean()
  taxableIfUnclaimed!: boolean;

  /** Answer 2407: the expense category people claim it under (one category per component), or null for none yet. */
  @IsOptional()
  @trim()
  @Matches(/^[a-z0-9_]{1,30}$/)
  expenseCategoryCode?: string | null;
}

export class FlexComponentChangeDto extends FlexComponentDto {
  @IsBoolean()
  active!: boolean;

  @IsInt()
  @Min(1)
  version!: number;
}

export class FlexLedgerQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Matches(YEAR)
  taxYear?: string;
}

/** Answer 2406: settle what is left, in March for the year or in the exit month for a leaver. */
export class FlexSettleDto {
  @IsIn(['year_end', 'exit'])
  kind!: 'year_end' | 'exit';

  @Matches(YEAR)
  taxYear!: string;

  /** One person (required for an exit); without it, everyone in your scope is settled for the year. */
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
