import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  // Optional: without it every company account with this email gets its own reset link.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  organizationSlug?: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;
}
