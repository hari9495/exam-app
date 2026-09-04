import { IsIn, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { STAGE_CATEGORIES } from '@exam-platform/shared';

export class CreateStageDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsIn(STAGE_CATEGORIES) category!: string;
  @IsInt() @Min(0) position!: number;
}
