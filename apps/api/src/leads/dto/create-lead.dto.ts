import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  workEmail!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  company!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  teamSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
