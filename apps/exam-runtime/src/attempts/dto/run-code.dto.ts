import { IsOptional, IsString } from 'class-validator';

export class RunCodeDto {
  @IsString()
  questionId!: string;

  @IsString()
  code!: string;

  @IsString()
  codeLanguage!: string;

  @IsOptional()
  @IsString()
  stdin?: string;
}
