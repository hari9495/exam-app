import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AnswerDto {
  @IsString()
  questionId!: string;

  // ponytail: empty array allowed — represents "mark for review before answering"
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds!: string[];

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}
