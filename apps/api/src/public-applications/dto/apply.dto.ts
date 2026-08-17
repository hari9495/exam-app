import { IsBase64, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApplyDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsBase64() resumeBase64!: string;
}
