import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  organizationSlug?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  // Generous (older accounts may predate the 128 cap) but bounded: argon2 work per attempt.
  @MaxLength(1024)
  password!: string;
}
