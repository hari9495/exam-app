import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertCertificateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  bodyText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signatoryName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
