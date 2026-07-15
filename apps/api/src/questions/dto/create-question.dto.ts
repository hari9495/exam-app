import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VALID_CODE_LANGUAGES } from '../question-validation';

export class QuestionOptionDto {
  @IsString()
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateQuestionDto {
  @IsIn(['single_mcq', 'multi_mcq', 'true_false', 'code'])
  type!: string;

  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsIn(['easy', 'medium', 'hard'])
  difficulty!: string;

  @IsInt()
  @Min(1)
  marks!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  negativeMarks?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(VALID_CODE_LANGUAGES)
  codeLanguage?: string;

  @IsOptional()
  @IsString()
  starterCode?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options!: QuestionOptionDto[];
}
