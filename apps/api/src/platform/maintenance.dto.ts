import { Transform, Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** YX-10: a planned maintenance window (start and length; the rules are checked by the service). */
export class MaintenanceWindowDto {
  @trim() @IsString() @MinLength(3) @MaxLength(120) @Matches(/^[^<>]*$/, { message: 'Write the title without < or >.' }) title!: string;
  @IsISO8601({ strict: true }) startsAt!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) hours!: number;
}

/** Approve or cancel a window (cancelling needs a reason). */
export class MaintenanceDecisionDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

