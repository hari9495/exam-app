import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertInterviewEmailTemplateDto {
  @IsString()
  @MaxLength(2000)
  subject!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
