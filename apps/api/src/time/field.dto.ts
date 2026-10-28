import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { MAX_BATCH } from './field-rules';

// Field force (TIM-32 / TIM-33) inputs. Every point is checked here; the database checks the ranges again.
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

class PointDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100_000)
  accuracyM!: number;

  /** The phone said the location is fake (developer option / mock app). */
  @IsOptional()
  @IsBoolean()
  mock?: boolean;
}

export class FieldConsentDto {
  @IsString()
  @MaxLength(20)
  noticeVersion!: string;
}

export class PingDto extends PointDto {
  @IsUUID()
  clientRef!: string;

  /** When the phone took the reading (ISO instant). */
  @IsDateString()
  at!: string;
}

export class PingBatchDto {
  /** The phone's clock when it sent the batch: a big gap from the server clock flags the batch ("skew"). */
  @IsDateString()
  sentAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => PingDto)
  pings!: PingDto[];
}

export class VisitPlanDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString({ strict: true })
  on!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  place!: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsInt()
  @Min(25)
  @Max(5000)
  radiusM?: number;

  /** Minutes after midnight, the person's local time. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  plannedMinute?: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class VisitCheckInDto extends PointDto {}

export class VisitCheckOutDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  outcome!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UnplannedVisitDto extends PointDto {
  @IsUUID()
  clientRef!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(150)
  place?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}
