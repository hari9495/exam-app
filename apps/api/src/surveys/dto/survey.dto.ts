import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export const SURVEY_QUESTION_TYPES = ['rating', 'text'] as const;
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];

export class SurveyQuestionDto {
  @IsIn(SURVEY_QUESTION_TYPES) type!: SurveyQuestionType;
  @IsString() @MaxLength(500) prompt!: string;
}

export class UpsertSurveyDto {
  @IsString() @MaxLength(200) name!: string;

  @IsOptional() @IsBoolean() enabled?: boolean;

  // A candidate global stage (e.g. 'rejected','hired') that auto-fires the survey; omit/empty = manual only.
  @IsOptional() @IsString() @MaxLength(50) triggerStage?: string;

  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SurveyQuestionDto)
  questions!: SurveyQuestionDto[];
}

export class SendSurveyDto {
  @IsString() entryId!: string;
}

// answers are aligned by index to the survey's current questions. Element values are validated
// against each question's type in the service (rating -> 1-5 int; text -> string), so the array
// element type is intentionally loose here.
export class SubmitSurveyDto {
  @IsArray() @ArrayMaxSize(20)
  answers!: (string | number | null)[];
}
