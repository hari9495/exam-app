import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { STAGE_CATEGORIES } from '@exam-platform/shared';

export class UpdateStageDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsIn(STAGE_CATEGORIES) category?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @IsArray() rules?: unknown[];
  /** HIR-04 answer 263: days a card should spend here at most; null clears it (none). */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(365) daysTarget?: number | null;
  /** HIR-04 answer 263: how many cards the stage should hold at most; null clears it (none). */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(1000) limit?: number | null;
}
