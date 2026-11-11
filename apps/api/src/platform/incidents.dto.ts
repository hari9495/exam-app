import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const PLAIN = { message: 'Write it without < or >.' };
export const STAGES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;

/** YX-10: a status update (what companies read in the banner once a second staff member approves it). */
export class IncidentUpdateDto {
  @IsIn(STAGES) stage!: (typeof STAGES)[number];
  @trim() @IsString() @MinLength(10) @MaxLength(500) @Matches(/^[^<>]*$/, PLAIN) impact!: string;
  @trim() @IsString() @MinLength(3) @MaxLength(300) @Matches(/^[^<>]*$/, PLAIN) action!: string;
  /** Minutes until the next update (none once resolved). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(15) @Max(1440) nextUpdateMinutes?: number;
}

/** Open an incident with its first update. */
export class IncidentOpenDto extends IncidentUpdateDto {
  @trim() @IsString() @MinLength(3) @MaxLength(120) @Matches(/^[^<>]*$/, PLAIN) title!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(3) severity!: number;
  @IsArray() @ArrayMinSize(1, { message: 'Choose at least one affected product.' }) @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(32, { each: true }) products!: string[];
}

/** Approve (post) or send back an update someone else wrote. */
export class IncidentReviewDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @trim() @IsString() @MaxLength(300) note?: string;
}

/** Answer 1124: mark the incident as a security breach of a contained company. */
export class IncidentBreachDto {
  @IsUUID() containmentId!: string;
}

export class IncidentSettingsDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(24) leadHours!: number;
}
