import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

// TIM-34 auto-roster inputs, checked here and again in the service.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: 'Give the date as yyyy-mm-dd.' };
/** 7 days for up to 100 shifts: more than any company has. */
export const MAX_DEMAND_ROWS = 700;
export const MAX_NEED = 500;

export class AutoRosterQueryDto {
  /** Omitted: the first location the viewer plans. */
  @IsOptional()
  @IsUUID('all', { message: 'Choose a location.' })
  locationId?: string;

  /** Any day of the week (Monday is used); omitted: this week. */
  @IsOptional()
  @Matches(DATE, DATE_MSG)
  week?: string;
}

export class DemandCellDto {
  @IsUUID('all', { message: 'Choose a shift.' })
  shiftId!: string;

  /** ISO weekday, 1 = Monday. */
  @IsInt({ message: 'A weekday is 1 (Monday) to 7 (Sunday).' })
  @Min(1, { message: 'A weekday is 1 (Monday) to 7 (Sunday).' })
  @Max(7, { message: 'A weekday is 1 (Monday) to 7 (Sunday).' })
  weekday!: number;

  @IsInt({ message: 'People needed is a whole number.' })
  @Min(0, { message: 'People needed is 0 or more.' })
  @Max(MAX_NEED, { message: `People needed is at most ${MAX_NEED}.` })
  need!: number;
}

export class DemandDto {
  @IsUUID('all', { message: 'Choose a location.' })
  locationId!: string;

  /** The cells to set; cells not sent stay as they are. Need 0 removes the cell. */
  @IsArray()
  @ArrayMaxSize(MAX_DEMAND_ROWS, { message: `Send at most ${MAX_DEMAND_ROWS} cells at once.` })
  @ValidateNested({ each: true })
  @Type(() => DemandCellDto)
  rows!: DemandCellDto[];
}

export class GenerateDto {
  @IsUUID('all', { message: 'Choose a location.' })
  locationId!: string;

  /** Any day of the week (Monday is used). */
  @Matches(DATE, DATE_MSG)
  week!: string;
}
