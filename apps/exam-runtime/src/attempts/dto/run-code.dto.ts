import { IsOptional, IsString } from 'class-validator';

export class RunCodeDto {
  @IsString()
  questionId!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  stdin?: string;
}
