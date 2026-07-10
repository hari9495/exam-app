import { ArrayMinSize, IsArray, IsIn, IsInt, IsString, Max, Min } from 'class-validator';

export class AiGenerateQuestionsDto {
  @IsString()
  topic!: string;

  @IsIn(['easy', 'medium', 'hard'])
  difficulty!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['single_mcq', 'multi_mcq', 'true_false'], { each: true })
  questionTypes!: string[];

  @IsInt()
  @Min(1)
  @Max(20)
  count!: number;
}
