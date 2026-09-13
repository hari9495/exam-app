import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GenerateInterviewQuestionsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15)
  count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  focus?: string;
}
