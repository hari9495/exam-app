import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateExamSectionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  targetDurationMinutes?: number;
}
