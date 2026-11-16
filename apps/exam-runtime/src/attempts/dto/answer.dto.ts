import { IsArray, IsBoolean, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AnswerTelemetryDto {
  @IsInt()
  @Min(0)
  keystrokeChars!: number;

  @IsInt()
  @Min(0)
  pastedChars!: number;

  @IsInt()
  @Min(0)
  pasteCount!: number;

  @IsInt()
  @Min(0)
  largestPasteChars!: number;

  @IsInt()
  @Min(0)
  secondsToFirstEdit!: number;

  @IsInt()
  @Min(0)
  activeSeconds!: number;

  @IsInt()
  @Min(0)
  runCount!: number;
}

export class AnswerDto {
  @IsString()
  questionId!: string;

  // ponytail: empty array allowed — represents "mark for review before answering"
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds!: string[];

  @IsOptional()
  @IsString()
  answerText?: string;

  @IsOptional()
  @IsString()
  codeLanguage?: string;

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnswerTelemetryDto)
  telemetry?: AnswerTelemetryDto;

  /** AS-4a: when the candidate's device saved this answer (sent later when it was offline); an older copy never wins. */
  @IsOptional()
  @IsISO8601({ strict: true })
  clientSavedAt?: string;
}

/** AS-5 (answer 2012): the candidate's appeal of an integrity decision, in their own words. */
export class AppealDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  text!: string;
}

/** AS-4a: the optional after-test survey (never affects the score). */
export class SurveyDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsBoolean()
  clearInstructions?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
