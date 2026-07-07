import { IsArray, IsString } from 'class-validator';

export class ReplaceSectionQuestionsDto {
  @IsArray()
  @IsString({ each: true })
  questionIds!: string[];
}
