import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterWalkInDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
