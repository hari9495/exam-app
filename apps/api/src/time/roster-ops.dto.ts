import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// Rosters (TIM-05 publish with a reason, TIM-40 licences, TIM-34 demand and auto-roster). Dates are "2026-11-03".
const DATE = { strict: true } as const;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RosterPublishDto {
  @IsDateString(DATE)
  week!: string;

  /** Rule 5: why published days that start within the notice change (the people are told at once). */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(5)
  @MaxLength(300)
  reason?: string;
}

export class LicenceTypeDto {
  @Matches(/^[A-Z][A-Z0-9-]{0,19}$/, { message: 'A code is 1 to 20 capital letters, digits or dashes, starting with a letter (FORK, BOILER-1).' })
  code!: string;

  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  note?: string;

  @IsBoolean()
  legal!: boolean;

  @IsArray()
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(365, { each: true })
  remindDays!: number[];
}

export class LicenceRequirementDto {
  @IsUUID()
  licenceTypeId!: string;

  @IsIn(['shift', 'role'])
  kind!: 'shift' | 'role';

  /** A shift id (kind shift) or a designation id (kind role). */
  @IsUUID()
  targetId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class EmployeeLicenceDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  licenceTypeId!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(60)
  number?: string;

  @IsDateString(DATE)
  validFrom!: string;

  @IsOptional()
  @IsDateString(DATE)
  expiresOn?: string;
}

export class LicenceOverrideDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  licenceTypeId!: string;

  @IsString()
  @Transform(trim)
  @MinLength(5)
  @MaxLength(300)
  reason!: string;

  @IsDateString(DATE)
  until!: string;
}

export class RenewAskDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  employeeIds!: string[];

  @IsUUID()
  licenceTypeId!: string;
}
