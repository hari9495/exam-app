import { IsEmail, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  organizationSlug!: string;

  @IsEmail()
  email!: string;
}
