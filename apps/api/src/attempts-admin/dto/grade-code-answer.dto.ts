import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GradeCodeAnswerDto {
  @IsInt()
  @Min(0)
  marksAwarded!: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
