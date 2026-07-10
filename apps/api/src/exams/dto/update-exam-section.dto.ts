import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { CreateExamSectionDto } from './create-exam-section.dto';

export class UpdateExamSectionDto extends CreateExamSectionDto {
  @IsOptional()
  @IsIn(['fixed', 'pool'])
  selectionMode?: string;

  @ValidateIf((o) => o.selectionMode === 'pool')
  @IsInt()
  @Min(1)
  poolSize?: number;

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  poolDifficulty?: string;

  @ValidateIf((o) => o.selectionMode === 'pool')
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  poolTagIds?: string[];
}
