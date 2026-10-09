import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { TENANT_SECURITY_FLOOR } from '@exam-platform/shared';

export class CompleteSetupDto {
  @IsString()
  token!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(TENANT_SECURITY_FLOOR.passwordMinLength)
  @MaxLength(TENANT_SECURITY_FLOOR.passwordMaxLength)
  password!: string;
}
