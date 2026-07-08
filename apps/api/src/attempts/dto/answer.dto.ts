import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AnswerDto {
  @IsString()
  questionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  selectedOptionIds!: string[];

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}
