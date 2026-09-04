import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { STAGE_CATEGORIES } from '@exam-platform/shared';

export class UpdateStageDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsIn(STAGE_CATEGORIES) category?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
