import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';

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

  // Capped because these go straight into a Prisma `in` clause. SQL Server's ~2100-parameter
  // limit would otherwise surface as a 500 from deep inside the driver rather than a 400 naming
  // the problem. 50 is far more tags than any real question carries.
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  tagIds!: string[];
}
