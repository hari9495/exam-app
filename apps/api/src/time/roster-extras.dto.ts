import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

// TIM-35 open shifts and TIM-38 standby and call-out: inputs, checked here and again in the services.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: 'Give the date as yyyy-mm-dd.' };
const TIME_MSG = { message: 'Give the time as an ISO date and time, for example 2026-11-03T22:00:00+05:30.' };

export class OpenShiftDto {
  @IsUUID('all', { message: 'Choose a location.' })
  locationId!: string;

  @IsUUID('all', { message: 'Choose a shift.' })
  shiftId!: string;

  @Matches(DATE, DATE_MSG)
  on!: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a licence type.' })
  licenceTypeId?: string;

  /** Omitted: the company's setting (roster.open_shift_rule). */
  @IsOptional()
  @IsIn(['manager_picks', 'first_come'], { message: 'Choose "Manager picks" or "First come".' })
  rule?: 'manager_picks' | 'first_come';

  @IsOptional()
  @IsISO8601({ strict: true }, TIME_MSG)
  closesAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Keep the note under 300 characters.' })
  note?: string;
}

export class OpenShiftQueryDto {
  @IsOptional()
  @IsIn(['open', 'all'])
  show?: 'open' | 'all';
}

export class AwardDto {
  @IsUUID('all', { message: 'Choose who gets the shift.' })
  employeeId!: string;

  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelOpenShiftDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Keep the reason under 300 characters.' })
  reason?: string;
}

export class StandbyQueryDto {
  @IsOptional()
  @Matches(DATE, DATE_MSG)
  week?: string;
}

export class SlotDto {
  @IsUUID('all', { message: 'Choose who is on standby.' })
  employeeId!: string;

  @IsISO8601({ strict: true }, TIME_MSG)
  startsAt!: string;

  @IsISO8601({ strict: true }, TIME_MSG)
  endsAt!: string;
}

export class CallOutDto {
  @IsUUID('all', { message: 'Choose who was called out.' })
  employeeId!: string;

  @IsISO8601({ strict: true }, TIME_MSG)
  startedAt!: string;

  @IsISO8601({ strict: true }, TIME_MSG)
  endedAt!: string;

  @IsString()
  @MinLength(3, { message: 'Say why they were called out.' })
  @MaxLength(300, { message: 'Keep the reason under 300 characters.' })
  reason!: string;

  /** Made once by the screen per call-out: a repeat (double click, retry) returns the first call-out. */
  @IsUUID('all', { message: 'Send a request id.' })
  clientRef!: string;
}

export class MoveShiftDto {
  @IsUUID('all')
  employeeId!: string;

  @Matches(DATE, DATE_MSG)
  on!: string;

  /** The new shift, or null for a day off. */
  @ValidateIf((_o, v) => v !== null)
  @IsUUID('all', { message: 'Choose a shift or a day off.' })
  shiftId!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Keep the reason under 300 characters.' })
  reason?: string;
}
