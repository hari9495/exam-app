import { ArrayMinSize, IsArray, IsIn, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';

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

  // Applied to every question in the batch. Without these the processor used to hardcode
  // marks: 1 / negativeMarks: 0, leaving the recruiter to fix every generated row by hand.
  @IsInt()
  @Min(1)
  @Max(100)
  marks!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  negativeMarks!: number;

  @IsArray()
  @IsUUID('4', { each: true })
  tagIds!: string[];
}
