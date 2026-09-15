import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VALID_CODE_LANGUAGES } from '../question-validation';

export class CodeTestCaseDto {
  @IsOptional()
  @IsString()
  stdin?: string;

  @IsString()
  expectedStdout!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  weight?: number;

  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}

export class QuestionOptionDto {
  @IsString()
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class CreateQuestionDto {
  @IsIn(['single_mcq', 'multi_mcq', 'true_false', 'code', 'essay', 'file_upload'])
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

  // Opt-in partial credit for a multi_mcq question. Forced false for every other type in the
  // service. Default false preserves all-or-nothing scoring.
  @IsOptional()
  @IsBoolean()
  partialCredit?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['fixed', 'any'])
  languageMode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedLanguages?: string[];

  @IsOptional()
  @IsString()
  starterCode?: string;

  @IsOptional()
  @IsBoolean()
  allowStdin?: boolean;

  // Recruiter-only reference answer / grading notes for an essay question (ignored for other
  // types). Never shown to candidates; surfaced to the grader in the manual-grading queue.
  @IsOptional()
  @IsString()
  modelAnswer?: string;

  @IsOptional()
  @IsString()
  snippetCode?: string;

  @IsOptional()
  @IsIn(VALID_CODE_LANGUAGES)
  snippetLanguage?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options!: QuestionOptionDto[];

  // Auto-grading test cases for a code question (ignored for non-code types). Shape re-validated in
  // the service via the shared validateCodeTests.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CodeTestCaseDto)
  codeTests?: CodeTestCaseDto[];
}
