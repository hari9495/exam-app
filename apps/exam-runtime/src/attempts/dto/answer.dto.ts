import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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
  @IsBoolean()
  markedForReview?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnswerTelemetryDto)
  telemetry?: AnswerTelemetryDto;
}
