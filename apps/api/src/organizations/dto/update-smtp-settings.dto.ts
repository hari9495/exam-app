import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateSmtpSettingsDto {
  @IsString()
  @MinLength(1)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @MinLength(1)
  user!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsEmail()
  fromAddress?: string;
}
